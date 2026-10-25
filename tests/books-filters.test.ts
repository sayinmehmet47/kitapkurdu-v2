import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { Miniflare } from "miniflare";
import { createDb } from "../src/db/index";
import { book } from "../src/db/schema";
import { listBooks, listCategories } from "../src/lib/books";

test("listBooks filters by language and category, and lists categories", {
	timeout: 60_000,
}, async (t) => {
	const statePath = await mkdtemp(join(tmpdir(), "kitapkurdu-filters-"));
	const runtime = new Miniflare({
		resourcePersistencePath: statePath,
		telemetry: { enabled: false },
		workers: [
			{
				config: {
					name: "books-filters-test",
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
					env: { DB: { type: "d1", id: "isolated-books-filters-test" } },
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
	await db.insert(book).values([
		{ name: "Sefiller", language: "turkish", category: ["Roman", "Klasik"] },
		{ name: "Suç ve Ceza", language: "turkish", category: ["Roman"] },
		{ name: "1984", language: "english", category: ["Bilim Kurgu"] },
	]);

	const names = (result: Awaited<ReturnType<typeof listBooks>>) =>
		result.results.map((row) => row.name).sort();

	const english = await listBooks(db, { language: "english" });
	assert.deepEqual(names(english), ["1984"]);

	const roman = await listBooks(db, { category: "Roman" });
	assert.deepEqual(names(roman), ["Sefiller", "Suç ve Ceza"]);

	const scifi = await listBooks(db, { category: "Bilim Kurgu" });
	assert.deepEqual(names(scifi), ["1984"]);

	assert.deepEqual(await listCategories(db), [
		"Bilim Kurgu",
		"Klasik",
		"Roman",
	]);
});
