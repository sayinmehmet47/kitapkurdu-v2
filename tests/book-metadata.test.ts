import assert from "node:assert/strict";
import { test } from "node:test";
import {
	GOOGLE_BOOKS_API_URL,
	lookupBookMetadata,
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

function stubFetch(body: unknown, status = 200) {
	const calls: URL[] = [];
	const fetch = (async (input: URL) => {
		calls.push(new URL(input));
		return new Response(JSON.stringify(body), { status });
	}) as unknown as typeof globalThis.fetch;
	return { fetch, calls };
}

test("Google Books lookup prefers ISBN and maps the first usable volume", async () => {
	const { fetch, calls } = stubFetch({
		items: [{ volumeInfo: {} }, { volumeInfo: volume }],
	});
	const metadata = await lookupBookMetadata(
		{ isbn: "978-975-07-1938-7", name: "ignored" },
		{ fetch, apiKey: "test-key" },
	);

	assert.equal(calls.length, 1);
	assert.equal(calls[0].origin + calls[0].pathname, GOOGLE_BOOKS_API_URL);
	assert.equal(calls[0].searchParams.get("q"), "isbn:9789750719387");
	assert.equal(calls[0].searchParams.get("key"), "test-key");
	assert.equal(metadata.status, "found");
	assert.deepEqual(metadata.status === "found" ? metadata.metadata : null, {
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

test("Google Books lookup falls back to the title and reports why it failed", async () => {
	const byName = stubFetch({ items: [{ volumeInfo: volume }] });
	await lookupBookMetadata(
		{ name: "Kürk Mantolu Madonna" },
		{ fetch: byName.fetch },
	);
	assert.equal(byName.calls[0].searchParams.get("q"), "Kürk Mantolu Madonna");

	const empty = stubFetch({ items: [{ volumeInfo: volume }] });
	assert.deepEqual(await lookupBookMetadata({ isbn: " ", name: "" }, empty), {
		status: "not-found",
	});
	assert.equal(empty.calls.length, 0, "An empty query makes no request");
	assert.deepEqual(
		await lookupBookMetadata({ name: "x" }, stubFetch({ totalItems: 0 })),
		{ status: "not-found" },
	);
	// Google answers 429 when the shared daily quota is spent (seen without a key).
	assert.deepEqual(
		await lookupBookMetadata({ name: "x" }, stubFetch({ error: 1 }, 429)),
		{ status: "unavailable" },
	);
	const failing = (async () => {
		throw new TypeError("network down");
	}) as unknown as typeof fetch;
	assert.deepEqual(
		await lookupBookMetadata({ name: "x" }, { fetch: failing }),
		{ status: "unavailable" },
	);
	const notJson = (async () =>
		new Response("<html>", { status: 200 })) as unknown as typeof fetch;
	assert.deepEqual(
		await lookupBookMetadata({ name: "x" }, { fetch: notJson }),
		{ status: "unavailable" },
	);
});

test("cover URLs are limited to https Google Books image hosts", () => {
	assert.equal(
		safeCoverUrl("http://books.google.com/books/content?id=1&edge=curl"),
		"https://books.google.com/books/content?id=1",
	);
	assert.equal(
		safeCoverUrl("https://books.googleusercontent.com/x.jpg"),
		"https://books.googleusercontent.com/x.jpg",
	);
	for (const unsafe of [
		"https://evil.test/cover.jpg",
		"https://books.google.com.evil.test/x",
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
