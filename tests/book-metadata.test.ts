import assert from "node:assert/strict";
import { test } from "node:test";
import {
	GOOGLE_BOOKS_API_URL,
	type LookupConfig,
	lookupBookMetadata,
	OPEN_LIBRARY_SEARCH_URL,
	safeCoverUrl,
} from "../src/lib/book-metadata";

const volume = {
	title: "Kürk Mantolu Madonna",
	authors: ["Sabahattin Ali"],
	publisher: "Yapı Kredi Yayınları",
	description: "Raif Efendi'nin hikâyesi.",
	categories: ["Fiction", "fiction", "Türk Edebiyatı"],
	industryIdentifiers: [
		{ type: "ISBN_10", identifier: "9750719383" },
		{ type: "ISBN_13", identifier: "9789750719387" },
	],
	imageLinks: {
		smallThumbnail:
			"http://books.google.com/books/content?id=abc&zoom=5&edge=curl",
		thumbnail: "http://books.google.com/books/content?id=abc&zoom=1&edge=curl",
	},
};

const work = {
	title: "Tutunamayanlar",
	author_name: ["Oğuz Atay"],
	publisher: ["İletişim", "Sinan"],
	subject: [
		"Turkish fiction",
		"turkish fiction",
		"18.84 Turkish language and/or literature",
		"Roman turc",
		"Novels",
		"Fiction",
	],
	cover_i: 8730101,
};

type Reply = { status?: number; body?: unknown } | Error;

// Answers Google and Open Library requests from queued replies.
function stub(replies: { google?: Reply[]; openLibrary?: Reply[] }) {
	const calls: URL[] = [];
	const logs: string[] = [];
	const fetch = (async (input: URL) => {
		const url = new URL(input);
		calls.push(url);
		const queue =
			url.hostname === "openlibrary.org" ? replies.openLibrary : replies.google;
		const reply = queue?.shift() ?? { status: 200, body: {} };
		if (reply instanceof Error) throw reply;
		return new Response(JSON.stringify(reply.body ?? {}), {
			status: reply.status ?? 200,
		});
	}) as unknown as typeof globalThis.fetch;
	const config: LookupConfig = {
		fetch,
		retryDelayMs: 0,
		apiKey: "secret-test-key",
		log: (message) => logs.push(message),
	};
	const google = () =>
		calls.filter((url) => url.hostname !== "openlibrary.org");
	const openLibrary = () =>
		calls.filter((url) => url.hostname === "openlibrary.org");
	return { config, calls, logs, google, openLibrary };
}

const unavailable = {
	status: 503,
	body: { error: { errors: [{ reason: "backendFailed" }] } },
};

test("Google Books is asked first, by ISBN, with the key and country", async () => {
	const s = stub({
		google: [{ body: { items: [{ volumeInfo: {} }, { volumeInfo: volume }] } }],
	});
	const result = await lookupBookMetadata(
		{ isbn: "978-975-07-1938-7", name: "ignored" },
		s.config,
	);

	const [call] = s.google();
	assert.equal(call.origin + call.pathname, GOOGLE_BOOKS_API_URL);
	assert.equal(call.searchParams.get("q"), "isbn:9789750719387");
	assert.equal(call.searchParams.get("key"), "secret-test-key");
	assert.equal(call.searchParams.get("country"), "TR");
	assert.equal(s.openLibrary().length, 0, "No fallback when Google answers");
	assert.equal(result.status, "found");
	assert.equal(result.status === "found" && result.source, "google");
	assert.deepEqual(result.status === "found" ? result.metadata : null, {
		title: "Kürk Mantolu Madonna",
		author: "Sabahattin Ali",
		isbn: "9789750719387",
		publisher: "Yapı Kredi Yayınları",
		description: "Raif Efendi'nin hikâyesi.",
		categories: ["Fiction", "Türk Edebiyatı"],
		coverThumbnail: "https://books.google.com/books/content?id=abc&zoom=1",
		coverSmallThumbnail: "https://books.google.com/books/content?id=abc&zoom=5",
	});
});

test("a Google 503 is retried once before falling back", async () => {
	const s = stub({
		google: [unavailable, { body: { items: [{ volumeInfo: volume }] } }],
	});
	const result = await lookupBookMetadata(
		{ name: "Kürk Mantolu Madonna" },
		s.config,
	);
	assert.equal(s.google().length, 2);
	assert.equal(s.google()[0].searchParams.get("q"), "Kürk Mantolu Madonna");
	assert.equal(result.status === "found" && result.source, "google");
	assert.deepEqual(s.logs, [
		"Book lookup via Google Books failed: HTTP 503 backendFailed",
	]);
	assert.ok(
		s.logs.every((line) => !line.includes("secret-test-key")),
		"The API key never reaches the logs",
	);
});

test("Open Library fills in when Google is down or has no match", async () => {
	// Title search: Open Library's work-level ISBN/publisher lists are not trusted.
	const byTitle = stub({
		google: [unavailable, unavailable],
		openLibrary: [{ body: { docs: [{}, work] } }],
	});
	const result = await lookupBookMetadata(
		{ name: "Tutunamayanlar" },
		byTitle.config,
	);
	const [call] = byTitle.openLibrary();
	assert.equal(call.origin + call.pathname, OPEN_LIBRARY_SEARCH_URL);
	assert.equal(call.searchParams.get("title"), "Tutunamayanlar");
	assert.equal(
		call.searchParams.get("key"),
		null,
		"The Google key stays with Google",
	);
	assert.equal(result.status === "found" && result.source, "openlibrary");
	assert.deepEqual(result.status === "found" ? result.metadata : null, {
		title: "Tutunamayanlar",
		author: "Oğuz Atay",
		categories: ["Turkish fiction", "Roman turc", "Novels"],
		coverThumbnail: "https://covers.openlibrary.org/b/id/8730101-M.jpg",
		coverSmallThumbnail: "https://covers.openlibrary.org/b/id/8730101-S.jpg",
	});

	// ISBN search: the ISBN is the one asked for, and the publisher is trusted.
	const byIsbn = stub({
		google: [{ body: { totalItems: 0 } }],
		openLibrary: [{ body: { docs: [work] } }],
	});
	const isbnResult = await lookupBookMetadata(
		{ isbn: "9789754700114" },
		byIsbn.config,
	);
	assert.equal(byIsbn.google().length, 1, "No retry when Google answered");
	assert.equal(
		byIsbn.openLibrary()[0].searchParams.get("isbn"),
		"9789754700114",
	);
	const metadata = isbnResult.status === "found" ? isbnResult.metadata : null;
	assert.equal(metadata?.isbn, "9789754700114");
	assert.equal(metadata?.publisher, "İletişim");
});

test("the result says whether nothing matched or no source answered", async () => {
	const empty = stub({});
	assert.deepEqual(
		await lookupBookMetadata({ isbn: " ", name: "" }, empty.config),
		{
			status: "not-found",
		},
	);
	assert.equal(empty.calls.length, 0, "An empty query makes no request");

	const noMatch = stub({
		google: [{ body: { totalItems: 0 } }],
		openLibrary: [{ body: { docs: [] } }],
	});
	assert.deepEqual(await lookupBookMetadata({ name: "x" }, noMatch.config), {
		status: "not-found",
	});

	// 429 (quota) is not retried; Open Library is still asked.
	const quota = stub({
		google: [
			{
				status: 429,
				body: { error: { errors: [{ reason: "rateLimitExceeded" }] } },
			},
		],
		openLibrary: [new TypeError("network down")],
	});
	assert.deepEqual(await lookupBookMetadata({ name: "x" }, quota.config), {
		status: "unavailable",
	});
	assert.equal(quota.google().length, 1);
	assert.deepEqual(quota.logs, [
		"Book lookup via Google Books failed: HTTP 429 rateLimitExceeded",
		"Book lookup via Open Library failed: TypeError",
	]);

	// A non-JSON 200 (e.g. an HTML error page) counts as unavailable too.
	const notJson = stub({});
	notJson.config.fetch = (async (input: URL) =>
		new URL(input).hostname === "openlibrary.org"
			? new Response("bad gateway", { status: 502 })
			: new Response("<html>", { status: 200 })) as unknown as typeof fetch;
	assert.deepEqual(await lookupBookMetadata({ name: "x" }, notJson.config), {
		status: "unavailable",
	});
});

test("cover URLs are limited to https source image hosts", () => {
	assert.equal(
		safeCoverUrl("http://books.google.com/books/content?id=1&edge=curl"),
		"https://books.google.com/books/content?id=1",
	);
	assert.equal(
		safeCoverUrl("https://books.googleusercontent.com/x.jpg"),
		"https://books.googleusercontent.com/x.jpg",
	);
	assert.equal(
		safeCoverUrl("https://covers.openlibrary.org/b/id/1-M.jpg"),
		"https://covers.openlibrary.org/b/id/1-M.jpg",
	);
	for (const unsafe of [
		"https://evil.test/cover.jpg",
		"https://books.google.com.evil.test/x",
		"https://openlibrary.org.evil.test/x",
		"javascript:alert(1)",
		"data:image/png;base64,AAAA",
		"not a url",
		"",
		42,
		undefined,
	]) {
		assert.equal(safeCoverUrl(unsafe), undefined, String(unsafe));
	}
});

test("title-only records are skipped in favour of the richest match", async () => {
	// Google's first hit can carry nothing but the title the user already typed.
	const richer = stub({
		google: [
			{
				body: {
					items: [
						{ volumeInfo: { title: "Kürk Mantolu Madonna" } },
						{
							volumeInfo: {
								title: "Kürk Mantolu Madonna",
								authors: ["Sabahattin Ali"],
							},
						},
						{ volumeInfo: volume },
					],
				},
			},
		],
	});
	const result = await lookupBookMetadata(
		{ name: "Kürk Mantolu Madonna" },
		richer.config,
	);
	const metadata = result.status === "found" ? result.metadata : null;
	assert.equal(
		metadata?.publisher,
		"Yapı Kredi Yayınları",
		"The richest volume wins",
	);

	// Only title-only records at Google: fall back to Open Library.
	const sparse = stub({
		google: [
			{ body: { items: [{ volumeInfo: { title: "Kürk Mantolu Madonna" } }] } },
		],
		openLibrary: [
			{
				body: {
					docs: [
						{ title: "Kürk Mantolu Madonna" },
						{
							title: "Kürk Mantolu Madonna",
							author_name: ["Sabahattin Ali"],
							cover_i: 7,
						},
					],
				},
			},
		],
	});
	const fallback = await lookupBookMetadata(
		{ name: "Kürk Mantolu Madonna" },
		sparse.config,
	);
	assert.equal(fallback.status === "found" && fallback.source, "openlibrary");
	assert.equal(
		fallback.status === "found" ? fallback.metadata.author : null,
		"Sabahattin Ali",
	);

	// Nothing beyond titles anywhere: report no match rather than an empty fill.
	const titlesOnly = stub({
		google: [{ body: { items: [{ volumeInfo: { title: "X" } }] } }],
		openLibrary: [{ body: { docs: [{ title: "X" }] } }],
	});
	assert.deepEqual(await lookupBookMetadata({ name: "X" }, titlesOnly.config), {
		status: "not-found",
	});
});

test("covers come only from reliable matches", async () => {
	// ISBN search: the cover is the exact edition's, and missing covers stay missing.
	const byIsbn = stub({
		google: [{ body: { totalItems: 0 } }],
		openLibrary: [{ body: { docs: [work] } }],
	});
	const isbnResult = await lookupBookMetadata(
		{ isbn: "9789754700114" },
		byIsbn.config,
	);
	const isbnMetadata =
		isbnResult.status === "found" ? isbnResult.metadata : null;
	assert.equal(
		isbnMetadata?.coverThumbnail,
		"https://covers.openlibrary.org/b/isbn/9789754700114-M.jpg?default=false",
	);
	assert.equal(
		isbnMetadata?.coverSmallThumbnail,
		"https://covers.openlibrary.org/b/isbn/9789754700114-S.jpg?default=false",
	);

	// Title search: a different book is not a match at all.
	const otherBook = stub({
		google: [
			{
				body: {
					items: [{ volumeInfo: { ...volume, title: "Madonna: A Biography" } }],
				},
			},
		],
		openLibrary: [
			{ body: { docs: [{ ...work, title: "Tutunamayanlar Üzerine" }] } },
		],
	});
	assert.deepEqual(
		await lookupBookMetadata({ name: "Tutunamayanlar" }, otherBook.config),
		{ status: "not-found" },
	);

	// Title search matches ignore case, accents and punctuation.
	const accents = stub({
		google: [unavailable, unavailable],
		openLibrary: [
			{ body: { docs: [{ ...work, title: "Kurk mantolu madonna!" }] } },
		],
	});
	const accentResult = await lookupBookMetadata(
		{ name: "Kürk Mantolu Madonna" },
		accents.config,
	);
	assert.equal(accentResult.status, "found");

	// A typed author must agree with the record's author.
	const wrongAuthor = stub({
		google: [{ body: { items: [{ volumeInfo: volume }] } }],
		openLibrary: [{ body: { docs: [] } }],
	});
	assert.deepEqual(
		await lookupBookMetadata(
			{ name: "Kürk Mantolu Madonna", author: "Orhan Pamuk" },
			wrongAuthor.config,
		),
		{ status: "not-found" },
	);
	const rightAuthor = stub({
		google: [{ body: { items: [{ volumeInfo: volume }] } }],
	});
	assert.equal(
		(
			await lookupBookMetadata(
				{ name: "Kürk Mantolu Madonna", author: "sabahattin ali" },
				rightAuthor.config,
			)
		).status,
		"found",
	);
});
