import { env } from "cloudflare:workers";
import { createDb } from "#/db";
import { createAuth } from "./auth-config";

// Construct the adapter within the request, never with mutable global request state.
export function getAuth() {
	return createAuth(createDb(env.DB), {
		secret: env.BETTER_AUTH_SECRET,
		baseURL: env.BETTER_AUTH_URL,
	});
}
