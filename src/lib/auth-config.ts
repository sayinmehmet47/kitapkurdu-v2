import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { betterAuth } from "better-auth/minimal";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import type { Database } from "#/db";
import * as schema from "#/db/schema";

export type GoogleCredentials = { clientId: string; clientSecret: string };

export function createAuth(
	db: Database,
	options: { secret: string; baseURL: string; google?: GoogleCredentials },
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
		// "Google ile devam et", only when the Google OAuth client is configured.
		// A Google account joins an existing account only if that account's
		// email is verified (Better Auth's default), so nobody can pre-register
		// someone else's Gmail address with a password and wait for them.
		socialProviders: options.google
			? { google: { ...options.google, prompt: "select_account" } }
			: undefined,
		user: {
			// "Hesabımı sil": with the password, or a session from the last day
			// (Google accounts). Sessions, accounts, ratings and messages go with
			// the user; uploaded books stay, without an uploader.
			deleteUser: {
				enabled: true,
				beforeDelete: async (user) => {
					// Keep the site from being left without its admin by accident.
					if ((user as { role?: string }).role === "admin")
						throw new APIError("BAD_REQUEST", {
							message: "Admin accounts cannot be deleted here.",
							code: "ADMIN_CANNOT_BE_DELETED",
						});
				},
			},
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
