import { env } from "cloudflare:workers";
import { createDb } from "#/db";
import { createAuth, type GoogleCredentials } from "./auth-config";

/**
 * The Google OAuth client from the optional GOOGLE_CLIENT_ID /
 * GOOGLE_CLIENT_SECRET Worker secrets; without both, Google sign-in is off.
 */
export function googleCredentials(): GoogleCredentials | undefined {
	const vars = env as unknown as Partial<
		Record<"GOOGLE_CLIENT_ID" | "GOOGLE_CLIENT_SECRET", string>
	>;
	return vars.GOOGLE_CLIENT_ID && vars.GOOGLE_CLIENT_SECRET
		? {
				clientId: vars.GOOGLE_CLIENT_ID,
				clientSecret: vars.GOOGLE_CLIENT_SECRET,
			}
		: undefined;
}

// Construct the adapter within the request, never with mutable global request state.
export function getAuth() {
	return createAuth(createDb(env.DB), {
		secret: env.BETTER_AUTH_SECRET,
		baseURL: env.BETTER_AUTH_URL,
		google: googleCredentials(),
	});
}
