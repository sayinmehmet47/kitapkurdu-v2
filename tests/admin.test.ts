import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { Miniflare } from "miniflare";
import { createDb } from "../src/db/index";
import { book, user } from "../src/db/schema";
import {
	deleteBookById,
	getBookById,
	listBooks,
	markBookDuplicate,
	updateBook,
} from "../src/lib/books";

test("admin book actions update, hide duplicates, and delete", {
	timeout: 60_000,
}, async (t) => {
	const statePath = await mkdtemp(join(tmpdir(), "kitapkurdu-admin-"));
	const runtime = new Miniflare({
		resourcePersistencePath: statePath,
		telemetry: { enabled: false },
		workers: [
			{
				config: {
					name: "admin-test",
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
					env: { DB: { type: "d1", id: "isolated-admin-test" } },
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
	const member = await db
		.insert(user)
		.values({ id: randomUUID(), name: "Member", email: "member@example.test" })
		.returning()
		.get();

	assert.equal(admin.role, "admin");
	assert.equal(member.role, "user", "default role must be user");

	const canonical = await db
		.insert(book)
		.values({ name: "1984", author: "George Orwell" })
		.returning()
		.get();

	const updated = await updateBook(db, canonical.id, {
		name: "Bin Dokuz Yüz Seksen Dört",
		author: "George Orwell",
		description: "Distopik bir roman.",
		category: "Roman, Bilim Kurgu",
		language: "turkish",
	});
	assert.equal(updated.name, "Bin Dokuz Yüz Seksen Dört");
	assert.deepEqual(updated.category, ["Roman", "Bilim Kurgu"]);

	const duplicate = await db
		.insert(book)
		.values({ name: "1984 (kopya)" })
		.returning()
		.get();
	await markBookDuplicate(db, duplicate.id, canonical.id);
	assert.equal(await getBookById(db, duplicate.id), undefined);
	const listed = await listBooks(db, { page: 1, limit: 10 });
	assert.ok(
		!listed.results.some((row) => row.id === duplicate.id),
		"duplicate must be hidden from listing",
	);

	await deleteBookById(db, canonical.id);
	assert.equal(await getBookById(db, canonical.id), undefined);
});
