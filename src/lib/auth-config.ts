import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { betterAuth } from "better-auth/minimal";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import type { Database } from "#/db";
import * as schema from "#/db/schema";

export function createAuth(
	db: Database,
	options: { secret: string; baseURL: string },
) {
	if (!options.secret || options.secret.length < 32) {
		throw new Error(
			"Set BETTER_AUTH_SECRET to a random value of at least 32 characters in .env.local.",
		);
	}

	return betterAuth({
		appName: "KitapKurdu",
		secret: options.secret,
		baseURL: options.baseURL,
		database: drizzleAdapter(db, {
			provider: "sqlite",
			schema,
			// D1 supports atomic batches, but not interactive transactions.
			transaction: false,
		}),
		emailAndPassword: { enabled: true },
		user: {
			additionalFields: {
				role: {
					type: ["user", "admin"],
					defaultValue: "user",
					input: false,
				},
			},
		},
		advanced: { ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] } },
		rateLimit: { enabled: true, storage: "database" },
		plugins: [tanstackStartCookies()],
	});
}
