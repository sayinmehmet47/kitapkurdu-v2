import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { Miniflare } from "miniflare";
import { createDb } from "../src/db/index";
import { book, user } from "../src/db/schema";
import {
	createBookWithFile,
	UPLOAD_LIMITS,
	UploadLimitError,
	uploadInput,
	uploadLimitsFor,
} from "../src/lib/uploads";
import { coverPng, metadataEpub, sampleEpub } from "./fixtures/book-files";

test("book uploads store the file in R2 and the metadata in D1", {
	timeout: 60_000,
}, async (t) => {
	const statePath = await mkdtemp(join(tmpdir(), "kitapkurdu-r2-"));
	const runtime = new Miniflare({
		resourcePersistencePath: statePath,
		telemetry: { enabled: false },
		workers: [
			{
				config: {
					name: "uploads-test",
					compatibilityDate: "2026-10-25",
					manifest: {
						mainModule: "index.mjs",
						modules: {
							"index.mjs": {
								type: "esm",
								contents:
									'export default { fetch() { return new Response("test") } }',
							},
						},
					},
					env: {
						DB: { type: "d1", id: "isolated-uploads-test" },
						BOOKS: { type: "r2" },
					},
				},
			},
		],
	});
	t.after(async () => {
		await runtime.dispose();
		await rm(statePath, { recursive: true, force: true });
	});

	const binding = await runtime.getD1Database("DB");
	const migrationsDir = new URL("../drizzle/", import.meta.url);
	const migrations = (await readdir(migrationsDir))
		.filter((file) => file.endsWith(".sql"))
		.sort();
	assert.ok(migrations.length > 0, "SQL migrations must exist");
	for (const file of migrations) {
		const sql = await readFile(new URL(file, migrationsDir), "utf8");
		for (const statement of sql.split("--> statement-breakpoint")) {
			if (statement.trim()) await binding.prepare(statement).run();
		}
	}

	const db = createDb(binding);
	const bucket = (await runtime.getR2Bucket("BOOKS")) as unknown as R2Bucket;
	const owner = await db
		.insert(user)
		.values({
			id: crypto.randomUUID(),
			name: "Owner",
			email: "owner@example.test",
		})
		.returning()
		.get();

	const payload = "%PDF-1.4 test book content";
	const row = await createBookWithFile(db, bucket, owner.id, {
		name: "  Deneme Kitabı  ",
		author: "Yazar",
		publisher: "Yayınevi",
		isbn: "9780000000000",
		description: "Açıklama",
		category: "Roman, Klasik",
		language: "turkish",
		fileName: "kitap.pdf",
		fileBase64: Buffer.from(payload).toString("base64"),
	});

	assert.equal(row.name, "Deneme Kitabı");
	assert.equal(row.uploaderId, owner.id);
	assert.equal(row.size, Buffer.byteLength(payload));
	assert.equal(row.language, "turkish");
	assert.deepEqual(row.category, ["Roman", "Klasik"]);
	assert.ok(row.fileUrl?.startsWith(`${owner.id}/`));
	assert.ok(row.fileUrl?.endsWith(".pdf"));

	const stored = await bucket.get(row.fileUrl ?? "");
	assert.ok(stored, "The uploaded file must exist in R2");
	assert.equal(stored.httpMetadata?.contentType, "application/pdf");
	assert.equal(await stored.text(), payload);

	// A data-URL prefix from the browser FileReader is stripped before decoding.
	const dataUrlRow = await createBookWithFile(db, bucket, owner.id, {
		name: "Veri URL",
		fileName: "veri.pdf",
		contentType: "application/pdf",
		fileBase64: `data:application/pdf;base64,${Buffer.from(payload).toString("base64")}`,
	});
	const dataUrlStored = await bucket.get(dataUrlRow.fileUrl ?? "");
	assert.ok(dataUrlStored);
	assert.equal(await dataUrlStored.text(), payload);

	assert.equal(uploadInput.safeParse({ name: "" }).success, false);
	assert.equal(
		uploadInput.safeParse({ name: "Kitap", fileBase64: "" }).success,
		false,
	);
	await assert.rejects(
		createBookWithFile(db, bucket, owner.id, {
			name: "HTML",
			fileName: "evil.html",
			fileBase64: Buffer.from(
				"<html><script>alert(1)</script></html>",
			).toString("base64"),
		}),
		/Yalnızca PDF/,
	);
	assert.equal(
		(await db.select().from(book)).length,
		2,
		"Only valid PDF uploads are recorded in D1",
	);

	// A configured ceiling can lower the built-in limit but never raise it.
	assert.equal(uploadLimitsFor("4096").maxTotalBytes, 4096);
	assert.equal(
		uploadLimitsFor(String(UPLOAD_LIMITS.maxTotalBytes * 2)).maxTotalBytes,
		UPLOAD_LIMITS.maxTotalBytes,
	);
	for (const invalid of [undefined, "", "abc", "-1", "0", "1.5"]) {
		assert.deepEqual(uploadLimitsFor(invalid), UPLOAD_LIMITS, String(invalid));
	}

	// Spending guardrails: limits are checked before anything is written to R2.
	const pdf = (name: string) => ({
		name,
		fileName: `${name}.pdf`,
		fileBase64: Buffer.from(payload).toString("base64"),
	});
	const objectCount = async () => (await bucket.list()).objects.length;
	const objectsBefore = await objectCount();

	await assert.rejects(
		createBookWithFile(db, bucket, owner.id, pdf("Günlük"), {
			maxTotalBytes: 1024 ** 3,
			maxUploadsPerDay: 2,
		}),
		(error: unknown) =>
			error instanceof UploadLimitError &&
			/Bugün en fazla 2/.test(error.message),
	);

	const used = (await db.select().from(book)).reduce(
		(total, item) => total + (item.size ?? 0),
		0,
	);
	await assert.rejects(
		createBookWithFile(db, bucket, owner.id, pdf("Dolu"), {
			maxTotalBytes: used + Buffer.byteLength(payload) - 1,
			maxUploadsPerDay: 100,
		}),
		(error: unknown) =>
			error instanceof UploadLimitError && /depolama alanı/.test(error.message),
	);

	// Another user is not affected by the first user's daily count.
	const reader = await db
		.insert(user)
		.values({
			id: crypto.randomUUID(),
			name: "Reader",
			email: "reader@example.test",
		})
		.returning()
		.get();
	await createBookWithFile(db, bucket, reader.id, pdf("Okur"), {
		maxTotalBytes: 1024 ** 3,
		maxUploadsPerDay: 2,
	});

	assert.equal(
		await objectCount(),
		objectsBefore + 1,
		"Rejected uploads must not write to R2",
	);
	assert.equal((await db.select().from(book)).length, 3);

	// Google Books enrichment fills only empty fields; typed values win.
	const roomy = { maxTotalBytes: 1024 ** 3, maxUploadsPerDay: 100 };
	const found = {
		title: "Kürk Mantolu Madonna",
		author: "Sabahattin Ali",
		isbn: "9789750719387",
		publisher: "Yapı Kredi Yayınları",
		description: "Raif Efendi'nin hikâyesi.",
		categories: ["Fiction"],
		coverThumbnail: "https://books.google.com/books/content?id=abc&zoom=1",
		coverSmallThumbnail: "https://books.google.com/books/content?id=abc&zoom=5",
	};
	const queries: unknown[] = [];
	const lookup = async (query: unknown) => {
		queries.push(query);
		return found;
	};

	const enriched = await createBookWithFile(
		db,
		bucket,
		reader.id,
		pdf("Kürk Mantolu Madonna"),
		roomy,
		lookup,
	);
	assert.deepEqual(queries.at(-1), {
		isbn: undefined,
		name: "Kürk Mantolu Madonna",
		author: undefined,
	});
	assert.equal(enriched.author, "Sabahattin Ali");
	assert.equal(enriched.publisher, "Yapı Kredi Yayınları");
	assert.equal(enriched.isbn, "9789750719387");
	assert.equal(enriched.description, "Raif Efendi'nin hikâyesi.");
	assert.deepEqual(enriched.category, ["Fiction"]);
	assert.equal(enriched.coverThumbnail, found.coverThumbnail);
	assert.equal(enriched.coverSmallThumbnail, found.coverSmallThumbnail);

	const typed = await createBookWithFile(
		db,
		bucket,
		reader.id,
		{
			...pdf("Elle Yazılmış"),
			author: "Elle Yazar",
			description: "Kendi yazdığım açıklama.",
			category: "Roman",
			isbn: "123",
			coverThumbnail: "https://evil.test/cover.jpg",
		},
		roomy,
		lookup,
	);
	assert.deepEqual(queries.at(-1), {
		isbn: "123",
		name: "Elle Yazılmış",
		author: "Elle Yazar",
	});
	assert.equal(typed.author, "Elle Yazar", "Typed author is kept");
	assert.equal(
		typed.description,
		"Kendi yazdığım açıklama.",
		"Typed description is kept even when enrichment returns another one",
	);
	assert.deepEqual(typed.category, ["Roman"], "Typed categories are kept");
	assert.equal(typed.isbn, "123", "Typed ISBN is kept");
	assert.equal(
		typed.publisher,
		"Yapı Kredi Yayınları",
		"Empty field is filled",
	);
	assert.equal(
		typed.coverThumbnail,
		found.coverThumbnail,
		"An unsafe cover URL from the client is dropped",
	);

	const noMatch = await createBookWithFile(
		db,
		bucket,
		reader.id,
		pdf("Bulunamayan"),
		roomy,
		async () => null,
	);
	assert.equal(noMatch.author, null, "No match leaves fields empty");
	assert.equal(noMatch.coverThumbnail, null);

	const callsBefore = queries.length;
	const complete = await createBookWithFile(
		db,
		bucket,
		reader.id,
		{
			...pdf("Tam"),
			author: "A",
			publisher: "B",
			isbn: "C",
			description: "D",
			category: "E",
			coverThumbnail: "http://books.google.com/books/content?id=z&edge=curl",
		},
		roomy,
		lookup,
	);
	assert.equal(queries.length, callsBefore, "Complete uploads skip the lookup");

	// A cover the uploader removed in the form is not added back on save.
	const noCover = await createBookWithFile(
		db,
		bucket,
		reader.id,
		{ ...pdf("Kapaksız"), coverRemoved: true },
		roomy,
		lookup,
	);
	assert.equal(noCover.coverThumbnail, null);
	assert.equal(noCover.coverSmallThumbnail, null);
	assert.equal(noCover.author, "Sabahattin Ali", "Other fields still fill");
	assert.deepEqual(queries.at(-1), {
		isbn: undefined,
		name: "Kapaksız",
		author: undefined,
	});
	assert.equal(
		complete.coverThumbnail,
		"https://books.google.com/books/content?id=z",
		"A Google cover from the preview is normalised and kept",
	);

	await t.test(
		"an EPUB's own details and cover fill what the uploader left empty",
		async () => {
			const epub = (overrides: Record<string, unknown> = {}) => ({
				name: "Kürk Mantolu Madonna",
				fileName: "madonna.epub",
				fileBase64: Buffer.from(metadataEpub()).toString("base64"),
				...overrides,
			});
			const fromFile = await createBookWithFile(
				db,
				bucket,
				reader.id,
				epub({ author: "Elle Yazılan" }),
				roomy,
			);
			assert.equal(fromFile.author, "Elle Yazılan", "Typed values win");
			assert.equal(fromFile.publisher, "Yapı Kredi Yayınları");
			assert.equal(fromFile.isbn, "9789750719387");
			assert.equal(fromFile.description, "Raif Efendi'nin hikâyesi.");
			assert.deepEqual(fromFile.category, ["Roman", "Türk Edebiyatı"]);
			// The embedded cover is stored next to the book and served by the app.
			assert.equal(fromFile.coverThumbnail, `/api/books/${fromFile.id}/cover`);
			assert.equal(fromFile.coverSmallThumbnail, null);
			const cover = await bucket.get(`covers/${fromFile.id}`);
			assert.ok(cover, "The embedded cover is stored in R2");
			assert.equal(cover.httpMetadata?.contentType, "image/png");
			assert.deepEqual(new Uint8Array(await cover.arrayBuffer()), coverPng());

			// The embedded cover beats a looked-up one; removing it stores nothing.
			const withLookup = await createBookWithFile(
				db,
				bucket,
				reader.id,
				epub({ coverThumbnail: "https://books.google.com/books/content?id=q" }),
				roomy,
			);
			assert.equal(
				withLookup.coverThumbnail,
				`/api/books/${withLookup.id}/cover`,
			);
			const removed = await createBookWithFile(
				db,
				bucket,
				reader.id,
				epub({ coverRemoved: true }),
				roomy,
			);
			assert.equal(removed.coverThumbnail, null);
			assert.equal(await bucket.get(`covers/${removed.id}`), null);
		},
	);

	await t.test(
		"EPUB stores its detected MIME and keeps all upload limits",
		async () => {
			const bytes = sampleEpub();
			const input = {
				name: "Örnek EPUB",
				fileName: "ornek.epub",
				fileBase64: Buffer.from(bytes).toString("base64"),
			};
			const uploaded = await createBookWithFile(
				db,
				bucket,
				reader.id,
				input,
				roomy,
			);
			assert.ok(uploaded.fileUrl?.endsWith(".epub"));
			assert.equal(uploaded.size, bytes.byteLength);
			const object = await bucket.get(uploaded.fileUrl ?? "");
			assert.ok(object);
			assert.equal(object.httpMetadata?.contentType, "application/epub+zip");
			assert.deepEqual(new Uint8Array(await object.arrayBuffer()), bytes);
			const before = await objectCount();
			await assert.rejects(
				createBookWithFile(db, bucket, reader.id, input, {
					...roomy,
					maxTotalBytes: 1,
				}),
				UploadLimitError,
			);
			await assert.rejects(
				createBookWithFile(db, bucket, reader.id, input, {
					...roomy,
					maxUploadsPerDay: 1,
				}),
				UploadLimitError,
			);
			assert.equal(await objectCount(), before);
		},
	);
});
