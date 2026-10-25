import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { eq } from "drizzle-orm";
import { Miniflare } from "miniflare";
import { createDb } from "../src/db/index";
import { book, rating, user } from "../src/db/schema";
import {
	BookDeletionError,
	deleteBookWithFile,
} from "../src/lib/book-deletion";
import { createBookWithFile, UploadLimitError } from "../src/lib/uploads";
import { sampleEpub, samplePdf } from "./fixtures/book-files";

const ROOMY = { maxTotalBytes: 1024 ** 3, maxUploadsPerDay: 100 };

test("owners and admins can delete book files safely; other users cannot", {
	timeout: 60_000,
}, async (t) => {
	const statePath = await mkdtemp(join(tmpdir(), "kitapkurdu-deletion-"));
	const runtime = new Miniflare({
		resourcePersistencePath: statePath,
		telemetry: { enabled: false },
		workers: [
			{
				config: {
					name: "deletion-test",
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
						DB: { type: "d1", id: "deletion-db" },
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
	const bucket = (await runtime.getR2Bucket("BOOKS")) as unknown as R2Bucket;
	const migrationsDir = new URL("../drizzle/", import.meta.url);
	for (const file of (await readdir(migrationsDir))
		.filter((file) => file.endsWith(".sql"))
		.sort()) {
		for (const statement of (
			await readFile(new URL(file, migrationsDir), "utf8")
		).split("--> statement-breakpoint")) {
			if (statement.trim()) await binding.prepare(statement).run();
		}
	}
	const db = createDb(binding);
	const owner = await db
		.insert(user)
		.values({
			id: randomUUID(),
			name: "Owner",
			email: "owner@example.test",
		})
		.returning()
		.get();
	const reader = await db
		.insert(user)
		.values({
			id: randomUUID(),
			name: "Reader",
			email: "reader@example.test",
		})
		.returning()
		.get();
	const admin = await db
		.insert(user)
		.values({
			id: randomUUID(),
			name: "Admin",
			email: "admin@example.test",
			role: "admin",
		})
		.returning()
		.get();
	const upload = (
		name: string,
		bytes: Uint8Array,
		limits = ROOMY,
		uploaderId = owner.id,
	) =>
		createBookWithFile(
			db,
			bucket,
			uploaderId,
			{
				name,
				fileName: "book.pdf",
				fileBase64: Buffer.from(bytes).toString("base64"),
			},
			limits,
		);

	await t.test(
		"anonymous and non-owner deletion leave everything intact",
		async () => {
			const item = await upload("Protected", samplePdf());
			assert.ok(item.fileUrl);
			for (const actor of [null, reader]) {
				await assert.rejects(
					deleteBookWithFile(db, bucket, item.id, actor),
					BookDeletionError,
				);
			}
			assert.ok(await db.select().from(book).where(eq(book.id, item.id)).get());
			assert.ok(await bucket.head(item.fileUrl));
		},
	);

	await t.test(
		"the owner can delete a PDF and its cascading ratings",
		async () => {
			const item = await upload("Owner PDF", samplePdf());
			assert.ok(item.fileUrl);
			await db.insert(rating).values({
				bookId: item.id,
				userId: reader.id,
				rating: 4,
				review: "Silinecek değerlendirme.",
			});
			await deleteBookWithFile(db, bucket, item.id, owner);
			assert.equal(
				await db.select().from(book).where(eq(book.id, item.id)).get(),
				undefined,
			);
			assert.equal(await bucket.head(item.fileUrl), null);
			assert.equal(
				await db.select().from(rating).where(eq(rating.bookId, item.id)).get(),
				undefined,
				"Book deletion must cascade to its ratings",
			);
		},
	);

	await t.test("an admin can delete another user's EPUB", async () => {
		const item = await upload("Admin EPUB", sampleEpub());
		assert.ok(item.fileUrl);
		await deleteBookWithFile(db, bucket, item.id, admin);
		assert.equal(
			await db.select().from(book).where(eq(book.id, item.id)).get(),
			undefined,
		);
		assert.equal(await bucket.head(item.fileUrl), null);
	});

	await t.test(
		"an R2 failure preserves the row and retries idempotently",
		async () => {
			const item = await upload("Retry", samplePdf());
			assert.ok(item.fileUrl);
			const failing = {
				delete: async () => {
					throw new Error("R2 unavailable");
				},
			};
			await assert.rejects(
				deleteBookWithFile(db, failing, item.id, owner),
				/R2 unavailable/,
			);
			assert.ok(await db.select().from(book).where(eq(book.id, item.id)).get());
			assert.ok(await bucket.head(item.fileUrl));

			// Simulate R2 succeeding before a D1 failure: a retry must not fail on
			// an already-missing object.
			await bucket.delete(item.fileUrl);
			await deleteBookWithFile(db, bucket, item.id, owner);
			assert.equal(
				await db.select().from(book).where(eq(book.id, item.id)).get(),
				undefined,
			);
		},
	);

	await t.test(
		"shared or external file references are never blindly deleted",
		async () => {
			const shared = await upload("Shared", sampleEpub());
			assert.ok(shared.fileUrl);
			const sibling = await db
				.insert(book)
				.values({ name: "Sibling", fileUrl: shared.fileUrl, size: shared.size })
				.returning()
				.get();
			await deleteBookWithFile(db, bucket, shared.id, owner);
			assert.ok(
				await bucket.head(shared.fileUrl),
				"A shared object must stay for the sibling",
			);
			assert.ok(
				await db.select().from(book).where(eq(book.id, sibling.id)).get(),
			);

			const external = await db
				.insert(book)
				.values({ name: "External", fileUrl: "https://example.test/book.pdf" })
				.returning()
				.get();
			await deleteBookWithFile(
				db,
				{ delete: async () => assert.fail("External URLs are not R2 keys") },
				external.id,
				admin,
			);
			assert.equal(
				await db.select().from(book).where(eq(book.id, external.id)).get(),
				undefined,
			);
		},
	);

	await t.test(
		"deleting a book does not reset the rolling daily upload limit",
		async () => {
			const daily = await db
				.insert(user)
				.values({
					id: randomUUID(),
					name: "Daily",
					email: "daily@example.test",
				})
				.returning()
				.get();
			const limited = { maxTotalBytes: 1024 ** 3, maxUploadsPerDay: 2 };
			const first = await upload("Daily one", samplePdf(), limited, daily.id);
			await upload("Daily two", samplePdf(), limited, daily.id);
			await deleteBookWithFile(db, bucket, first.id, daily);
			await assert.rejects(
				upload("Daily three", samplePdf(), limited, daily.id),
				(error: unknown) =>
					error instanceof UploadLimitError &&
					/Bugün en fazla 2/.test(error.message),
				"A deleted upload still counts for 24 hours",
			);
		},
	);
});
