import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { Miniflare } from "miniflare";
import { createDb } from "../src/db/index";
import { book } from "../src/db/schema";
import { getBookById } from "../src/lib/books";

test("getBookById returns a book, hides duplicates, and returns undefined for missing ids", {
	timeout: 60_000,
}, async (t) => {
	const statePath = await mkdtemp(join(tmpdir(), "kitapkurdu-detail-"));
	const runtime = new Miniflare({
		resourcePersistencePath: statePath,
		telemetry: { enabled: false },
		workers: [
			{
				config: {
					name: "book-detail-test",
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
					env: { DB: { type: "d1", id: "isolated-book-detail-test" } },
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
	const canonical = await db
		.insert(book)
		.values({ name: "Sefiller", author: "Victor Hugo" })
		.returning()
		.get();
	const duplicate = await db
		.insert(book)
		.values({ name: "Sefiller (kopya)", duplicateOfId: canonical.id })
		.returning()
		.get();

	const found = await getBookById(db, canonical.id);
	assert.ok(found, "canonical book must be returned");
	assert.equal(found.name, "Sefiller");
	assert.equal(found.author, "Victor Hugo");

	assert.equal(
		await getBookById(db, "missing-id"),
		undefined,
		"missing id must return undefined",
	);

	assert.ok(duplicate.id, "duplicate row must exist");
	assert.equal(
		await getBookById(db, duplicate.id),
		undefined,
		"duplicate-marked book must be hidden from detail",
	);
});
