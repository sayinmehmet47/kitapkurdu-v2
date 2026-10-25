import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { Miniflare } from "miniflare";
import { createDb } from "../src/db/index";
import { book, rating, user } from "../src/db/schema";
import {
	getRatingSummary,
	listRatings,
	ratingInput,
	upsertRating,
} from "../src/lib/ratings";

test("ratings are one per user, average correctly, and validate input", {
	timeout: 60_000,
}, async (t) => {
	const statePath = await mkdtemp(join(tmpdir(), "kitapkurdu-ratings-"));
	const runtime = new Miniflare({
		resourcePersistencePath: statePath,
		telemetry: { enabled: false },
		workers: [
			{
				config: {
					name: "ratings-test",
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
					env: { DB: { type: "d1", id: "isolated-ratings-test" } },
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
	for (const file of migrations) {
		const sql = await readFile(new URL(file, migrationsDir), "utf8");
		for (const statement of sql.split("--> statement-breakpoint")) {
			if (statement.trim()) await binding.prepare(statement).run();
		}
	}

	const db = createDb(binding);
	const alice = await db
		.insert(user)
		.values({ id: randomUUID(), name: "Alice", email: "alice@example.test" })
		.returning()
		.get();
	const bob = await db
		.insert(user)
		.values({ id: randomUUID(), name: "Bob", email: "bob@example.test" })
		.returning()
		.get();
	const theBook = await db
		.insert(book)
		.values({ name: "1984", author: "George Orwell" })
		.returning()
		.get();

	await upsertRating(db, alice.id, {
		bookId: theBook.id,
		rating: 5,
		review: "Harika",
	});
	await upsertRating(db, alice.id, { bookId: theBook.id, rating: 3 });

	const aliceRows = await db.select().from(rating);
	assert.equal(aliceRows.length, 1, "one rating per user per book");
	assert.equal(aliceRows[0].rating, 3, "upsert must update the existing row");

	const summary = await getRatingSummary(db, theBook.id);
	assert.equal(summary?.count, 1);
	assert.equal(summary?.average, 3);

	await upsertRating(db, bob.id, { bookId: theBook.id, rating: 1 });
	const summary2 = await getRatingSummary(db, theBook.id);
	assert.equal(summary2?.count, 2);
	assert.equal(summary2?.average, 2);

	const listed = await listRatings(db, theBook.id);
	assert.equal(listed.length, 2);
	assert.deepEqual(listed.map((row) => row.username).sort(), ["Alice", "Bob"]);

	assert.equal(
		ratingInput.safeParse({ bookId: theBook.id, rating: 0 }).success,
		false,
	);
	assert.equal(
		ratingInput.safeParse({ bookId: theBook.id, rating: 6 }).success,
		false,
	);
	assert.equal(
		ratingInput.safeParse({ bookId: theBook.id, rating: 3 }).success,
		true,
	);
});
