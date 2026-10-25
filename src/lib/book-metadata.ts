// Google Books lookup for uploads (ported from v1's googleBooksMetadata.service).
// A lookup never throws or blocks an upload. "unavailable" covers timeouts,
// network errors, and Google errors such as 429 when the daily quota is spent.

export const GOOGLE_BOOKS_API_URL =
	"https://www.googleapis.com/books/v1/volumes";
const TIMEOUT_MS = 5000;

// Only Google Books' own image hosts; anything else is dropped, so a cover URL
// can never point the browser at an arbitrary site.
const COVER_HOSTS = new Set([
	"books.google.com",
	"books.googleusercontent.com",
]);

export type BookMetadata = {
	title?: string;
	author?: string;
	isbn?: string;
	publisher?: string;
	description?: string;
	categories?: string[];
	coverThumbnail?: string;
	coverSmallThumbnail?: string;
};

export type MetadataQuery = { isbn?: string; name?: string };

export type LookupResult =
	| { status: "found"; metadata: BookMetadata }
	| { status: "not-found" }
	| { status: "unavailable" };

export type LookupConfig = {
	apiUrl?: string;
	apiKey?: string;
	fetch?: typeof fetch;
};

function text(value: unknown) {
	return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function texts(value: unknown) {
	return Array.isArray(value)
		? value.map(text).filter((item): item is string => Boolean(item))
		: [];
}

/** Returns an https Google Books image URL, or undefined for anything else. */
export function safeCoverUrl(value: unknown) {
	const raw = text(value);
	if (!raw) return undefined;
	try {
		const url = new URL(raw.replace(/^http:\/\//, "https://"));
		if (url.protocol !== "https:" || !COVER_HOSTS.has(url.hostname)) {
			return undefined;
		}
		// Google adds a page-curl effect to thumbnails by default; drop it.
		url.searchParams.delete("edge");
		return url.toString();
	} catch {
		return undefined;
	}
}

function parseVolume(volume: Record<string, unknown>): BookMetadata {
	const identifiers = Array.isArray(volume.industryIdentifiers)
		? (volume.industryIdentifiers as { type?: unknown; identifier?: unknown }[])
		: [];
	const isbnOf = (type: string) =>
		text(
			identifiers.find((item) => text(item?.type)?.toUpperCase() === type)
				?.identifier,
		);
	const images = (volume.imageLinks ?? {}) as Record<string, unknown>;

	// Keep the first spelling of each category, ignoring case.
	const seen = new Set<string>();
	const categories = texts(volume.categories).filter((category) => {
		const key = category.toLocaleLowerCase("tr");
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});

	const metadata: BookMetadata = {
		title: text(volume.title),
		author: texts(volume.authors).join(", ") || undefined,
		isbn: isbnOf("ISBN_13") ?? isbnOf("ISBN_10"),
		publisher: text(volume.publisher),
		description: text(volume.description),
		categories: categories.length > 0 ? categories : undefined,
		coverThumbnail: safeCoverUrl(images.thumbnail),
		coverSmallThumbnail: safeCoverUrl(images.smallThumbnail),
	};
	return Object.fromEntries(
		Object.entries(metadata).filter(([, value]) => value !== undefined),
	) as BookMetadata;
}

export async function lookupBookMetadata(
	query: MetadataQuery,
	config: LookupConfig = {},
): Promise<LookupResult> {
	const isbn = text(query.isbn)?.replace(/[\s-]/g, "");
	const name = text(query.name);
	const q = isbn ? `isbn:${isbn}` : name;
	if (!q) return { status: "not-found" };

	const url = new URL(config.apiUrl ?? GOOGLE_BOOKS_API_URL);
	url.searchParams.set("q", q);
	url.searchParams.set("maxResults", "5");
	if (config.apiKey) url.searchParams.set("key", config.apiKey);

	try {
		const response = await (config.fetch ?? fetch)(url, {
			signal: AbortSignal.timeout(TIMEOUT_MS),
			headers: { accept: "application/json" },
		});
		if (!response.ok) return { status: "unavailable" };
		const body = (await response.json()) as { items?: unknown };
		const items = Array.isArray(body.items) ? body.items : [];
		for (const item of items) {
			const volume = (item as { volumeInfo?: unknown })?.volumeInfo;
			if (!volume || typeof volume !== "object") continue;
			const metadata = parseVolume(volume as Record<string, unknown>);
			if (Object.keys(metadata).length > 0)
				return { status: "found", metadata };
		}
		return { status: "not-found" };
	} catch {
		return { status: "unavailable" };
	}
}
