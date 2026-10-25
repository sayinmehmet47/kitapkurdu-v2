import assert from "node:assert/strict";
import { test } from "node:test";
import { metadataFromFileName } from "../src/lib/book-file-metadata";
import { detectCoverType } from "../src/lib/cover-image";
import { readEpubMetadata } from "../src/lib/epub";
import { findIsbn, normalizeIsbn } from "../src/lib/isbn";
import { coverPng, metadataEpub, sampleEpub } from "./fixtures/book-files";

test("file names give a title, author and ISBN", () => {
	assert.deepEqual(
		metadataFromFileName(
			"Monte Kristo Kontu -- Alexandre Dumas Dumas Alexandre -- ( WeLib.org ).epub",
		),
		{ title: "Monte Kristo Kontu", author: "Alexandre Dumas", isbn: undefined },
	);
	assert.deepEqual(
		metadataFromFileName(
			"Kürk Mantolu Madonna -- Sabahattin Ali -- 9789750719387 -- [Anna's Archive].pdf",
		),
		{
			title: "Kürk Mantolu Madonna",
			author: "Sabahattin Ali",
			isbn: "9789750719387",
		},
	);
	assert.deepEqual(metadataFromFileName("tutunamayanlar_oguz_atay.pdf"), {
		title: "tutunamayanlar oguz atay",
		author: undefined,
		isbn: undefined,
	});
});

test("ISBNs are normalised and checksum-verified", () => {
	assert.equal(normalizeIsbn("urn:isbn:978-975-07-1938-7"), "9789750719387");
	assert.equal(normalizeIsbn("0-306-40615-2"), "0306406152");
	assert.equal(normalizeIsbn("080442957X"), "080442957X");
	assert.equal(normalizeIsbn("9789750719388"), undefined, "bad checksum");
	assert.equal(normalizeIsbn("synthetic-book"), undefined);
	assert.equal(normalizeIsbn(undefined), undefined);
});

test("cover types come from the file signature", () => {
	assert.equal(detectCoverType(coverPng()), "image/png");
	assert.equal(
		detectCoverType(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0])),
		"image/jpeg",
	);
	assert.equal(
		detectCoverType(new TextEncoder().encode("<svg onload=alert(1)>")),
		undefined,
	);
});

test("EPUB package metadata and the embedded cover are read", () => {
	const metadata = readEpubMetadata(metadataEpub());
	assert.equal(metadata.title, "Kürk Mantolu Madonna");
	assert.equal(
		metadata.author,
		"Sabahattin Ali",
		"Translators are not authors",
	);
	assert.equal(metadata.publisher, "Yapı Kredi Yayınları");
	assert.equal(metadata.language, "turkish");
	assert.equal(metadata.isbn, "9789750719387");
	assert.equal(metadata.description, "Raif Efendi'nin hikâyesi.");
	assert.deepEqual(metadata.categories, ["Roman", "Türk Edebiyatı"]);
	assert.equal(metadata.cover?.type, "image/png");
	assert.deepEqual(metadata.cover?.bytes, coverPng());

	// EPUB 2 points at the cover from <meta name="cover">; a non-image is ignored.
	const epub2 = (coverBytes: Uint8Array) =>
		sampleEpub({
			"EPUB/package.opf": `<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="id">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">x</dc:identifier><dc:title>Eski Biçim</dc:title><meta name="cover" content="c"/></metadata>
<manifest><item id="c" href="c.jpg" media-type="image/jpeg"/><item id="one" href="one.xhtml" media-type="application/xhtml+xml"/></manifest>
<spine><itemref idref="one"/></spine></package>`,
			"EPUB/c.jpg": coverBytes,
		});
	assert.equal(readEpubMetadata(epub2(coverPng())).cover?.type, "image/png");
	assert.equal(
		readEpubMetadata(epub2(new TextEncoder().encode("not an image"))).cover,
		undefined,
	);
	assert.deepEqual(readEpubMetadata(new Uint8Array([1, 2, 3])), {});
});

test("tool-named covers are found and blurbs in subjects become descriptions", () => {
	// Sigil-style: no cover markers, the image is just named "cover".
	const blurb =
		"Dumas klasik romanın kilometre taşlarından biri olan bu yapıtında, insan psikolojisine duyduğu ilgiyi anlatıyor.";
	const metadata = readEpubMetadata(
		sampleEpub({
			"EPUB/package.opf": `<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="id">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">x</dc:identifier><dc:title>Monte Kristo Kontu</dc:title><dc:subject>${blurb}</dc:subject><dc:subject>Macera</dc:subject></metadata>
<manifest><item id="cover.jpg" href="Images/cover.jpg" media-type="image/jpeg"/><item id="one" href="one.xhtml" media-type="application/xhtml+xml"/></manifest>
<spine><itemref idref="one"/></spine></package>`,
			"EPUB/Images/cover.jpg": coverPng(),
		}),
	);
	assert.equal(metadata.cover?.type, "image/png", "Type comes from the bytes");
	assert.deepEqual(metadata.categories, ["Macera"]);
	assert.equal(metadata.description, blurb);
});

test("ISBNs are found in a book's text", () => {
	assert.equal(
		findIsbn("Yayın no: 1234 ISBN: 978-975-07-1938-7 Baskı: 2019"),
		"9789750719387",
	);
	assert.equal(findIsbn("ISBN-10 0-306-40615-2"), "0306406152");
	assert.equal(findIsbn("Barkod 978 975 07 1938 7"), "9789750719387");
	// Labelled numbers win; checksums reject look-alikes such as phone numbers.
	assert.equal(
		findIsbn("9780306406157 ... ISBN 978-975-07-1938-7"),
		"9789750719387",
	);
	assert.equal(findIsbn("Tel: 978 975 07 1938 8, sayfa 0306406153"), undefined);
	assert.equal(findIsbn("ISBN 9789750719387123"), undefined);
});

test("an EPUB's ISBN is found in its chapters only when asked", () => {
	const epub = sampleEpub({
		"EPUB/two.xhtml": `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>Künye</title></head><body><p>Yapı Kredi Yayınları</p><p>ISBN <span>978-975-07-1938-7</span></p></body></html>`,
	});
	assert.equal(
		readEpubMetadata(epub, { scanText: true }).isbn,
		"9789750719387",
	);
	assert.equal(readEpubMetadata(epub).isbn, undefined, "The Worker skips text");
	// The package identifier still comes first.
	assert.equal(
		readEpubMetadata(metadataEpub({ isbn: "0-306-40615-2" }), {
			scanText: true,
		}).isbn,
		"0306406152",
	);
});
