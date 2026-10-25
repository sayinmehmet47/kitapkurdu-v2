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
});
