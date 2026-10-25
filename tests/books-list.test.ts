import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { Miniflare } from "miniflare";
import { createDb } from "../src/db/index";
import { book } from "../src/db/schema";
import { listBooks } from "../src/lib/books";

test("listBooks paginates, hides duplicates, and orders newest first", {
	timeout: 60_000,
}, async (t) => {
	const statePath = await mkdtemp(join(tmpdir(), "kitapkurdu-books-"));
	const runtime = new Miniflare({
		resourcePersistencePath: statePath,
		telemetry: { enabled: false },
		workers: [
			{
				config: {
					name: "books-list-test",
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
					env: { DB: { type: "d1", id: "isolated-books-list-test" } },
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

	const empty = await listBooks(db, { page: 1, limit: 12 });
	assert.deepEqual(empty.results, []);
	assert.equal(empty.total, 0);
	assert.equal(empty.pageCount, 1);

	await db
		.insert(book)
		.values({ name: "A", createdAt: new Date("2026-01-01T00:00:00Z") });
	const b = await db
		.insert(book)
		.values({ name: "B", createdAt: new Date("2026-01-02T00:00:00Z") })
		.returning()
		.get();
	const c = await db
		.insert(book)
		.values({ name: "C", createdAt: new Date("2026-01-03T00:00:00Z") })
		.returning()
		.get();
	await db.insert(book).values({
		name: "Dup",
		createdAt: new Date("2026-01-04T00:00:00Z"),
		duplicateOfId: b.id,
	});

	const page1 = await listBooks(db, { page: 1, limit: 2 });
	assert.equal(page1.total, 3, "duplicate-marked book must be hidden");
	assert.equal(page1.results.length, 2);
	assert.equal(page1.pageCount, 2);
	assert.equal(page1.results[0].name, "C", "newest book comes first");
	assert.equal(page1.results[1].name, "B");
	assert.equal(page1.results[0].id, c.id);

	const page2 = await listBooks(db, { page: 2, limit: 2 });
	assert.equal(page2.results.length, 1);
	assert.equal(page2.results[0].name, "A");
	assert.ok(
		!page2.results.some((row) => row.name === "Dup"),
		"duplicate-marked book must not appear",
	);

	await assert.rejects(
		listBooks(db, { page: 0, limit: 2 }),
		/page/,
		"page below 1 must be rejected",
	);
});
