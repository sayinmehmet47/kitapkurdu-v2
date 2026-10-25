import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { Miniflare } from "miniflare";
import { createDb } from "../src/db/index";
import { user } from "../src/db/schema";
import { listMessages, messageInput, postMessage } from "../src/lib/messages";

test("messages post and list with the sender's username", {
	timeout: 60_000,
}, async (t) => {
	const statePath = await mkdtemp(join(tmpdir(), "kitapkurdu-messages-"));
	const runtime = new Miniflare({
		resourcePersistencePath: statePath,
		telemetry: { enabled: false },
		workers: [
			{
				config: {
					name: "messages-test",
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
					env: { DB: { type: "d1", id: "isolated-messages-test" } },
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

	const posted = await postMessage(db, alice.id, { text: "  Merhaba raf!  " });
	assert.equal(posted.text, "Merhaba raf!", "text must be trimmed");

	const messages = await listMessages(db);
	assert.equal(messages.length, 1);
	assert.equal(messages[0].text, "Merhaba raf!");
	assert.equal(messages[0].username, "Alice");

	assert.equal(messageInput.safeParse({ text: "   " }).success, false);
	assert.equal(
		messageInput.safeParse({ text: "x".repeat(501) }).success,
		false,
	);
	assert.equal(messageInput.safeParse({ text: "ok" }).success, true);
});
