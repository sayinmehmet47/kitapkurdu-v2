// Book details for uploads: Google Books first (ported from v1's
// googleBooksMetadata.service), Open Library as a fallback. A lookup never
// throws or blocks an upload.

export const GOOGLE_BOOKS_API_URL =
	"https://www.googleapis.com/books/v1/volumes";
export const OPEN_LIBRARY_SEARCH_URL = "https://openlibrary.org/search.json";
const TIMEOUT_MS = 4000;
// Google Books intermittently answers 503 "backendFailed"; one retry after a
// short pause usually gets through.
const RETRY_DELAY_MS = 400;
// Open Library asks clients to identify themselves.
const USER_AGENT = "KitapKurdu/1.0 (https://kitapkurdu.kigx.xyz)";

// Only the sources' own image hosts; anything else is dropped, so a cover URL
// can never point the browser at an arbitrary site.
const COVER_HOSTS = new Set([
	"books.google.com",
	"books.googleusercontent.com",
	"covers.openlibrary.org",
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

export type MetadataSource = "google" | "openlibrary";

export type LookupResult =
	| { status: "found"; source: MetadataSource; metadata: BookMetadata }
	| { status: "not-found" }
	| { status: "unavailable" };

type SourceResult =
	| { status: "found"; metadata: BookMetadata }
	| { status: "not-found" }
	| { status: "unavailable" };

export type LookupConfig = {
	apiUrl?: string;
	openLibraryUrl?: string;
	apiKey?: string;
	fetch?: typeof fetch;
	retryDelayMs?: number;
	/** Receives one line per failed request; never includes the API key. */
	log?: (message: string) => void;
};

function text(value: unknown) {
	return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function texts(value: unknown) {
	return Array.isArray(value)
		? value.map(text).filter((item): item is string => Boolean(item))
		: [];
}

// Keep the first spelling of each category, ignoring case.
function uniqueCategories(values: string[], limit = Number.POSITIVE_INFINITY) {
	const seen = new Set<string>();
	return values
		.filter((category) => {
			const key = category.toLocaleLowerCase("tr");
			if (seen.has(key)) return false;
			seen.add(key);
			return true;
		})
		.slice(0, limit);
}

function compact(metadata: BookMetadata): BookMetadata {
	return Object.fromEntries(
		Object.entries(metadata).filter(
			([, value]) =>
				value !== undefined && !(Array.isArray(value) && value.length === 0),
		),
	) as BookMetadata;
}

/** Returns an https cover URL on a known source host, or undefined. */
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

function parseGoogleVolume(volume: Record<string, unknown>): BookMetadata {
	const identifiers = Array.isArray(volume.industryIdentifiers)
		? (volume.industryIdentifiers as { type?: unknown; identifier?: unknown }[])
		: [];
	const isbnOf = (type: string) =>
		text(
			identifiers.find((item) => text(item?.type)?.toUpperCase() === type)
				?.identifier,
		);
	const images = (volume.imageLinks ?? {}) as Record<string, unknown>;

	return compact({
		title: text(volume.title),
		author: texts(volume.authors).join(", ") || undefined,
		isbn: isbnOf("ISBN_13") ?? isbnOf("ISBN_10"),
		publisher: text(volume.publisher),
		description: text(volume.description),
		categories: uniqueCategories(texts(volume.categories)),
		coverThumbnail: safeCoverUrl(images.thumbnail),
		coverSmallThumbnail: safeCoverUrl(images.smallThumbnail),
	});
}

// Open Library search results describe a work, not an edition: its ISBN and
// publisher lists mix every edition. Only trust them when we searched by ISBN.
function parseOpenLibraryDoc(
	doc: Record<string, unknown>,
	isbn: string | undefined,
): BookMetadata {
	const coverId = doc.cover_i;
	const cover = (size: "M" | "S") =>
		typeof coverId === "number" && Number.isSafeInteger(coverId)
			? safeCoverUrl(
					`https://covers.openlibrary.org/b/id/${coverId}-${size}.jpg`,
				)
			: undefined;
	// Subjects are noisy ("18.84 Turkish language…"); keep a few plain ones.
	const subjects = texts(doc.subject).filter(
		(subject) => subject.length <= 40 && !/\d/.test(subject),
	);

	return compact({
		title: text(doc.title),
		author: texts(doc.author_name).join(", ") || undefined,
		isbn,
		publisher: isbn ? texts(doc.publisher)[0] : undefined,
		categories: uniqueCategories(subjects, 3),
		coverThumbnail: cover("M"),
		coverSmallThumbnail: cover("S"),
	});
}

async function request(
	url: URL,
	config: LookupConfig,
	source: string,
): Promise<{ ok: true; body: unknown } | { ok: false; retry: boolean }> {
	const log = config.log ?? ((message: string) => console.warn(message));
	try {
		const response = await (config.fetch ?? fetch)(url, {
			signal: AbortSignal.timeout(TIMEOUT_MS),
			headers: { accept: "application/json", "user-agent": USER_AGENT },
		});
		const body: unknown = await response.json().catch(() => undefined);
		if (response.ok && body !== undefined) return { ok: true, body };
		// Log the status and Google's reason (e.g. backendFailed), never the URL:
		// it carries the API key.
		const reason = (body as { error?: { errors?: { reason?: unknown }[] } })
			?.error?.errors?.[0]?.reason;
		log(
			`Book lookup via ${source} failed: HTTP ${response.status}${typeof reason === "string" ? ` ${reason}` : ""}`,
		);
		return { ok: false, retry: response.status >= 500 };
	} catch (error) {
		log(
			`Book lookup via ${source} failed: ${error instanceof Error ? error.name : "error"}`,
		);
		return { ok: false, retry: true };
	}
}

async function fromGoogle(
	q: string,
	config: LookupConfig,
): Promise<SourceResult> {
	const url = new URL(config.apiUrl ?? GOOGLE_BOOKS_API_URL);
	url.searchParams.set("q", q);
	url.searchParams.set("maxResults", "5");
	// Lets Google resolve availability for server-side requests. It does not
	// filter by language: books in any language are still returned.
	url.searchParams.set("country", "TR");
	if (config.apiKey) url.searchParams.set("key", config.apiKey);

	let result = await request(url, config, "Google Books");
	if (!result.ok && result.retry) {
		await new Promise((resolve) =>
			setTimeout(resolve, config.retryDelayMs ?? RETRY_DELAY_MS),
		);
		result = await request(url, config, "Google Books");
	}
	if (!result.ok) return { status: "unavailable" };

	const items = (result.body as { items?: unknown })?.items;
	for (const item of Array.isArray(items) ? items : []) {
		const volume = (item as { volumeInfo?: unknown })?.volumeInfo;
		if (!volume || typeof volume !== "object") continue;
		const metadata = parseGoogleVolume(volume as Record<string, unknown>);
		if (Object.keys(metadata).length > 0) return { status: "found", metadata };
	}
	return { status: "not-found" };
}

async function fromOpenLibrary(
	query: { isbn?: string; name?: string },
	config: LookupConfig,
): Promise<SourceResult> {
	const url = new URL(config.openLibraryUrl ?? OPEN_LIBRARY_SEARCH_URL);
	if (query.isbn) url.searchParams.set("isbn", query.isbn);
	else url.searchParams.set("title", query.name ?? "");
	url.searchParams.set("limit", "5");
	url.searchParams.set("fields", "title,author_name,publisher,subject,cover_i");

	const result = await request(url, config, "Open Library");
	if (!result.ok) return { status: "unavailable" };

	const docs = (result.body as { docs?: unknown })?.docs;
	for (const doc of Array.isArray(docs) ? docs : []) {
		if (!doc || typeof doc !== "object") continue;
		const metadata = parseOpenLibraryDoc(
			doc as Record<string, unknown>,
			query.isbn,
		);
		if (metadata.title) return { status: "found", metadata };
	}
	return { status: "not-found" };
}

export async function lookupBookMetadata(
	query: MetadataQuery,
	config: LookupConfig = {},
): Promise<LookupResult> {
	const isbn = text(query.isbn)?.replace(/[\s-]/g, "");
	const name = text(query.name);
	if (!isbn && !name) return { status: "not-found" };

	const google = await fromGoogle(isbn ? `isbn:${isbn}` : (name ?? ""), config);
	if (google.status === "found") return { ...google, source: "google" };

	const openLibrary = await fromOpenLibrary({ isbn, name }, config);
	if (openLibrary.status === "found") {
		return { ...openLibrary, source: "openlibrary" };
	}
	// Report "not found" only if a source actually answered.
	return google.status === "not-found" || openLibrary.status === "not-found"
		? { status: "not-found" }
		: { status: "unavailable" };
}
