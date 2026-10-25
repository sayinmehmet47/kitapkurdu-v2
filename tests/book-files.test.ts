import assert from "node:assert/strict";
import { test } from "node:test";
import { strToU8, zipSync } from "fflate";
import {
	bookFileHeaders,
	MAX_BOOK_FILE_BYTES,
	storedBookFormat,
} from "../src/lib/book-file-format";
import { detectBookFormat } from "../src/lib/book-files";
import {
	EPUB_LIMITS,
	EpubError,
	inspectEpub,
	readEpubChapter,
	resolveEpubPath,
} from "../src/lib/epub";
import { sampleEpub, samplePdf } from "./fixtures/book-files";

test("PDF and EPUB detection uses contents, not browser MIME or extension", () => {
	assert.equal(detectBookFormat(samplePdf()), "pdf");
	assert.equal(detectBookFormat(sampleEpub()), "epub");
	for (const bytes of [
		new Uint8Array(),
		strToU8("<html>not a book</html>"),
		new Uint8Array(MAX_BOOK_FILE_BYTES + 1),
	]) {
		assert.throws(() => detectBookFormat(bytes));
	}
	assert.equal(storedBookFormat("owner/old-book.pdf"), "pdf");
	assert.equal(storedBookFormat("owner/new-book.epub"), "epub");
	assert.equal(storedBookFormat(null), null);
	assert.equal(storedBookFormat("book.html"), null);
});

test("EPUB validates the container, manifest, spine, and local paths", () => {
	const bytes = sampleEpub();
	const book = inspectEpub(bytes);
	assert.equal(book.chapters.length, 2);
	assert.equal(book.chapters[0].path, "EPUB/one.xhtml");
	assert.match(readEpubChapter(bytes, book.chapters[1]), /İkinci bölüm/);
	assert.equal(
		resolveEpubPath("EPUB/package.opf", "../Text/chapter%201.xhtml#start"),
		"Text/chapter 1.xhtml",
	);
	const invalid = [
		zipSync({ "ordinary.txt": strToU8("a ZIP is not an EPUB") }),
		sampleEpub({ mimetype: "application/zip" }),
		sampleEpub({ "META-INF/container.xml": "<broken>" }),
		sampleEpub({ "EPUB/package.opf": "<package/>" }),
		sampleEpub({ "META-INF/encryption.xml": "<encryption/>" }),
		sampleEpub({ "../escape.txt": "bad path" }),
		sampleEpub({
			"META-INF/container.xml":
				'<!DOCTYPE container [<!ENTITY x "bad">]><container>&x;</container>',
		}),
		sampleEpub({
			"EPUB/one.xhtml": new Uint8Array(EPUB_LIMITS.chapterBytes + 1),
		}),
		sampleEpub().subarray(0, 100),
	];
	for (const archive of invalid) {
		assert.throws(() => inspectEpub(archive), EpubError);
		assert.throws(() => detectBookFormat(archive));
	}
	for (const href of [
		"../../escape.xhtml",
		"https://evil.invalid/book.xhtml",
		"//evil.invalid/a",
		"%2e%2e/%2e%2e/x",
		"a\\b",
		"a%00b",
	]) {
		assert.throws(() => resolveEpubPath("EPUB/package.opf", href));
	}
});

test("EPUB archive index rejects excessive entries and expansion before extraction", () => {
	const entries = Object.fromEntries(
		Array.from({ length: EPUB_LIMITS.entries + 1 }, (_, i) => [
			`extra/${i}.txt`,
			"",
		]),
	);
	assert.throws(() => inspectEpub(sampleEpub(entries)), EpubError);
	const oversized = sampleEpub({
		"EPUB/oversized.bin": new Uint8Array(EPUB_LIMITS.entryBytes + 1),
	});
	assert.throws(() => inspectEpub(oversized), EpubError);
});

test("EPUB extraction bounds real output even when ZIP headers lie about its size", () => {
	const bytes = sampleEpub({ "EPUB/one.xhtml": "a".repeat(1024 * 1024) });
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	let changed = false;
	for (let offset = 0; offset + 46 < bytes.length; offset++) {
		if (view.getUint32(offset, true) !== 0x02014b50) continue;
		const nameSize = view.getUint16(offset + 28, true);
		const name = new TextDecoder().decode(
			bytes.subarray(offset + 46, offset + 46 + nameSize),
		);
		if (name !== "EPUB/one.xhtml") continue;
		view.setUint32(offset + 24, 1, true);
		const localOffset = view.getUint32(offset + 42, true);
		view.setUint32(localOffset + 22, 1, true);
		changed = true;
		break;
	}
	assert.ok(changed, "The fixture must contain the selected chapter entry");
	const pkg = inspectEpub(bytes);
	assert.throws(() => readEpubChapter(bytes, pkg.chapters[0]), EpubError);
});

test("download headers preserve old PDFs and never serve EPUB as active HTML", () => {
	const pdf = bookFileHeaders("pdf", "book-id", 123);
	assert.equal(pdf.get("content-type"), "application/pdf");
	assert.equal(
		pdf.get("content-disposition"),
		'inline; filename="book-id.pdf"',
	);
	const epub = bookFileHeaders("epub", "book-id", 456);
	assert.equal(epub.get("content-type"), "application/epub+zip");
	assert.equal(
		epub.get("content-disposition"),
		'attachment; filename="book-id.epub"',
	);
	assert.equal(epub.get("x-content-type-options"), "nosniff");
	assert.equal(epub.get("content-length"), "456");
	assert.match(
		bookFileHeaders("pdf", "book-id", 123, true).get("content-disposition") ??
			"",
		/^attachment;/,
	);
});
