import { env } from "cloudflare:workers";
import type { LookupConfig } from "#/lib/book-metadata";

// Optional: GOOGLE_BOOKS_API_KEY (Worker secret) avoids the anonymous quota;
// GOOGLE_BOOKS_API_URL / OPEN_LIBRARY_API_URL point E2E tests at local stubs.
export function metadataConfig(): LookupConfig {
	const vars = env as unknown as Partial<
		Record<
			"GOOGLE_BOOKS_API_KEY" | "GOOGLE_BOOKS_API_URL" | "OPEN_LIBRARY_API_URL",
			string
		>
	>;
	return {
		apiKey: vars.GOOGLE_BOOKS_API_KEY || undefined,
		apiUrl: vars.GOOGLE_BOOKS_API_URL || undefined,
		openLibraryUrl: vars.OPEN_LIBRARY_API_URL || undefined,
	};
}
