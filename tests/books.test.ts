import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { eq } from "drizzle-orm";
import { Miniflare } from "miniflare";
import { createDb } from "../src/db/index";
import { book } from "../src/db/schema";

test("book schema round-trips in isolated D1", {
	timeout: 60_000,
}, async (t) => {
	const statePath = await mkdtemp(join(tmpdir(), "kitapkurdu-book-"));
	const runtime = new Miniflare({
		resourcePersistencePath: statePath,
		telemetry: { enabled: false },
		workers: [
			{
				config: {
					name: "book-test",
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
					env: { DB: { type: "d1", id: "isolated-book-test" } },
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

	const inserted = await db
		.insert(book)
		.values({
			name: "Sefiller",
			author: "Victor Hugo",
			isbn: "9789750712739",
			publisher: "Can Yayınları",
			description: "Klasik bir roman.",
			category: ["Roman", "Klasik"],
			language: "turkish",
			fileUrl: "https://example.test/sefiller.pdf",
			size: 1048576,
			coverThumbnail: "https://example.test/cover.jpg",
		})
		.returning()
		.get();

	assert.ok(inserted.id, "book id must be generated");
	assert.equal(inserted.name, "Sefiller");
	assert.equal(inserted.author, "Victor Hugo");
	assert.equal(inserted.language, "turkish");
	assert.deepEqual(inserted.category, ["Roman", "Klasik"]);
	assert.equal(inserted.size, 1048576);

	const found = await db
		.select()
		.from(book)
		.where(eq(book.id, inserted.id))
		.get();
	assert.ok(found, "book must be readable by id");
	assert.equal(found.author, "Victor Hugo");
	assert.equal(found.fileUrl, "https://example.test/sefiller.pdf");

	assert.equal(
		(await db.select().from(book)).length,
		1,
		"only the inserted book should exist",
	);
});
