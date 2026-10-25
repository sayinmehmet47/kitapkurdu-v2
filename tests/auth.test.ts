import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { eq } from "drizzle-orm";
import { Miniflare } from "miniflare";
import { createDb } from "../src/db/index";
import { account, book, rateLimit, session } from "../src/db/schema";
import { createAuth } from "../src/lib/auth-config";
import { getMyRating, upsertRating } from "../src/lib/ratings";

test("authentication and private data persist in local D1", {
	timeout: 60_000,
}, async (t) => {
	const statePath = await mkdtemp(join(tmpdir(), "kitapkurdu-d1-"));
	const baseURL = "http://localhost:3000";
	const secret = randomBytes(32).toString("hex");
	const password = randomBytes(24).toString("base64url");

	const startRuntime = () =>
		new Miniflare({
			resourcePersistencePath: statePath,
			telemetry: { enabled: false },
			workers: [
				{
					config: {
						name: "auth-test",
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
						env: { DB: { type: "d1", id: "isolated-auth-test" } },
					},
				},
			],
		});

	let runtime = startRuntime();
	t.after(async () => {
		await runtime.dispose();
		await rm(statePath, { recursive: true, force: true });
	});

	let binding = await runtime.getD1Database("DB");
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

	let db = createDb(binding);
	let auth = createAuth(db, { secret, baseURL });
	const request = (
		path: string,
		data?: Record<string, string>,
		cookie?: string,
	) => {
		const headers = new Headers({
			origin: baseURL,
			"cf-connecting-ip": "127.0.0.1",
		});
		if (data) headers.set("content-type", "application/json");
		if (cookie) headers.set("cookie", cookie);
		return auth.handler(
			new Request(`${baseURL}/api/auth/${path}`, {
				method: data ? "POST" : "GET",
				headers,
				body: data ? JSON.stringify(data) : undefined,
			}),
		);
	};
	const getCookie = (response: Response) => {
		const cookie = response.headers
			.getSetCookie()
			.map((value) => value.split(";")[0])
			.join("; ");
		assert.ok(
			cookie.includes("session_token="),
			"Authentication must issue a session cookie",
		);
		return cookie;
	};

	let aliceId = "";
	let aliceCookie = "";
	let bobId = "";

	await t.test(
		"signup stores the user, hashed password, and session in D1",
		async () => {
			const response = await request("sign-up/email", {
				email: "alice@example.test",
				name: "Alice",
				password,
			});
			assert.equal(response.status, 200);
			aliceCookie = getCookie(response);
			const result = (await response.json()) as {
				user: { id: string; email: string };
			};
			aliceId = result.user.id;
			assert.equal(result.user.email, "alice@example.test");
			const storedAccount = await db
				.select()
				.from(account)
				.where(eq(account.userId, aliceId))
				.get();
			assert.ok(storedAccount?.password);
			assert.notEqual(
				storedAccount.password,
				password,
				"Passwords must never be stored in plaintext",
			);
			assert.equal(
				(await db.select().from(session).where(eq(session.userId, aliceId)))
					.length,
				1,
			);
		},
	);

	await t.test(
		"anonymous requests have no session and bad credentials are rejected",
		async () => {
			assert.equal(await (await request("get-session")).json(), null);
			const response = await request("sign-in/email", {
				email: "alice@example.test",
				password: "incorrect-password",
			});
			assert.equal(response.status, 401);
		},
	);

	await t.test(
		"sessions survive replacing the auth instance and restarting local D1",
		async () => {
			await runtime.dispose();
			runtime = startRuntime();
			binding = await runtime.getD1Database("DB");
			db = createDb(binding);
			auth = createAuth(db, { secret, baseURL });
			const response = await request("get-session", undefined, aliceCookie);
			assert.equal(response.status, 200);
			const result = (await response.json()) as { user: { id: string } };
			assert.equal(result.user.id, aliceId);
		},
	);

	await t.test(
		"a second account cannot see the first account’s own rating",
		async () => {
			const response = await request("sign-up/email", {
				email: "bob@example.test",
				name: "Bob",
				password,
			});
			assert.equal(response.status, 200);
			bobId = ((await response.json()) as { user: { id: string } }).user.id;
			const theBook = await db
				.insert(book)
				.values({ name: "Sefiller" })
				.returning()
				.get();
			await upsertRating(db, aliceId, {
				bookId: theBook.id,
				rating: 5,
				review: "  Alice’s note  ",
			});
			const aliceRating = await getMyRating(db, theBook.id, aliceId);
			assert.equal(aliceRating?.rating, 5);
			assert.equal(aliceRating?.review, "Alice’s note");
			assert.equal(await getMyRating(db, theBook.id, bobId), undefined);
		},
	);

	await t.test("untrusted origins cannot create accounts", async () => {
		const response = await auth.handler(
			new Request(`${baseURL}/api/auth/sign-up/email`, {
				method: "POST",
				headers: {
					origin: "https://untrusted.example",
					"content-type": "application/json",
					"cf-connecting-ip": "127.0.0.1",
				},
				body: JSON.stringify({
					email: "blocked@example.test",
					name: "Blocked",
					password,
				}),
			}),
		);
		assert.equal(response.status, 403);
	});

	await t.test(
		"signout deletes the stored session and rejects the old cookie",
		async () => {
			const response = await request("sign-out", {}, aliceCookie);
			assert.equal(response.status, 200);
			assert.equal(
				await (await request("get-session", undefined, aliceCookie)).json(),
				null,
			);
			assert.equal(
				(await db.select().from(session).where(eq(session.userId, aliceId)))
					.length,
				0,
			);
		},
	);

	await t.test(
		"email sign-in works after restarting and expired sessions are rejected",
		async () => {
			const response = await request("sign-in/email", {
				email: "alice@example.test",
				password,
			});
			assert.equal(response.status, 200);
			const cookie = getCookie(response);
			await db
				.update(session)
				.set({ expiresAt: new Date(Date.now() - 60_000) })
				.where(eq(session.userId, aliceId));
			assert.equal(
				await (await request("get-session", undefined, cookie)).json(),
				null,
			);
		},
	);

	await t.test(
		"rate limits persist across auth instances instead of resetting per request",
		async () => {
			const failedLogin = () =>
				auth.handler(
					new Request(`${baseURL}/api/auth/sign-in/email`, {
						method: "POST",
						headers: {
							origin: baseURL,
							"content-type": "application/json",
							"cf-connecting-ip": "203.0.113.42",
						},
						body: JSON.stringify({
							email: "alice@example.test",
							password: "incorrect-password",
						}),
					}),
				);
			for (let attempt = 0; attempt < 3; attempt++) {
				assert.equal((await failedLogin()).status, 401);
			}
			assert.equal((await failedLogin()).status, 429);
			assert.ok((await db.select().from(rateLimit)).length > 0);
			auth = createAuth(db, { secret, baseURL });
			assert.equal((await failedLogin()).status, 429);
		},
	);
});
