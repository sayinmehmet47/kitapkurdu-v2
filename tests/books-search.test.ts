import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { Miniflare } from "miniflare";
import { createDb } from "../src/db/index";
import { book } from "../src/db/schema";
import { listBooks } from "../src/lib/books";

test("listBooks filters by a query across name, author, and description", {
	timeout: 60_000,
}, async (t) => {
	const statePath = await mkdtemp(join(tmpdir(), "kitapkurdu-search-"));
	const runtime = new Miniflare({
		resourcePersistencePath: statePath,
		telemetry: { enabled: false },
		workers: [
			{
				config: {
					name: "books-search-test",
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
					env: { DB: { type: "d1", id: "isolated-books-search-test" } },
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
		{
			name: "Sefiller",
			author: "Victor Hugo",
			description: "Klasik bir roman.",
		},
		{
			name: "1984",
			author: "George Orwell",
			description: "Distopik bir roman.",
		},
		{
			name: "Suç ve Ceza",
			author: "Fyodor Dostoyevski",
			description: "Psikolojik bir roman.",
		},
	]);

	const names = (result: Awaited<ReturnType<typeof listBooks>>) =>
		result.results.map((row) => row.name).sort();

	const byAuthor = await listBooks(db, { q: "orwell" });
	assert.deepEqual(names(byAuthor), ["1984"]);
	assert.equal(byAuthor.total, 1);

	const caseInsensitive = await listBooks(db, { q: "HUGO" });
	assert.deepEqual(names(caseInsensitive), ["Sefiller"]);

	const byDescription = await listBooks(db, { q: "roman" });
	assert.deepEqual(names(byDescription), ["1984", "Sefiller", "Suç ve Ceza"]);
	assert.equal(byDescription.total, 3);

	const noMatch = await listBooks(db, { q: "zzz" });
	assert.deepEqual(noMatch.results, []);
	assert.equal(noMatch.total, 0);

	const blank = await listBooks(db, { q: "   " });
	assert.equal(blank.total, 3, "blank query must not filter");
});
