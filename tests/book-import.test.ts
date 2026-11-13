import assert from "node:assert/strict";
import { test } from "node:test";
import {
	completeDetails,
	detailsFromFile,
	sameBook,
} from "../src/lib/book-import";

test("import details come from the file, then fill gaps from a match", () => {
	const fromFile = detailsFromFile({
		title: "kunye",
		isbn: "9789750719387",
		language: "english",
		categories: ["Roman", "Klasik"],
	});
	assert.deepEqual(fromFile, {
		name: "kunye",
		author: "",
		publisher: "",
		isbn: "9789750719387",
		description: "",
		category: "Roman, Klasik",
		language: "english",
	});
	const found = {
		title: "Kürk Mantolu Madonna",
		author: "Sabahattin Ali",
		publisher: "Yapı Kredi Yayınları",
		isbn: "9789750719387",
		description: "Raif Efendi.",
		categories: ["Fiction"],
		coverThumbnail: "https://books.google.com/x",
	};
	// The file's own details win; a title guessed from the file name does not.
	assert.deepEqual(completeDetails(fromFile, found, { nameIsGuess: true }), {
		...fromFile,
		name: "Kürk Mantolu Madonna",
		author: "Sabahattin Ali",
		publisher: "Yapı Kredi Yayınları",
		description: "Raif Efendi.",
		coverThumbnail: "https://books.google.com/x",
	});
	assert.equal(completeDetails(fromFile, found).name, "kunye");
});

test("the same book is recognised despite case, accents and missing authors", () => {
	assert.ok(
		sameBook(
			{ name: "KÜRK MANTOLU MADONNA", author: "SABAHATTİN ALİ" },
			{ name: "Kürk Mantolu Madonna", author: "Sabahattin Ali" },
		),
	);
	assert.ok(
		sameBook(
			{ name: "İnce Memed" },
			{ name: "ince memed", author: "Yaşar Kemal" },
		),
		"an unknown author still matches the title",
	);
	assert.ok(
		sameBook(
			{ name: "Başka", isbn: "978-975-07-1938-7" },
			{ name: "Kürk Mantolu Madonna", isbn: "9789750719387" },
		),
		"the same ISBN is the same book",
	);
	assert.equal(
		sameBook(
			{ name: "Şiirler", author: "Nazım Hikmet" },
			{ name: "Şiirler", author: "Orhan Veli" },
		),
		false,
	);
	assert.equal(sameBook({ name: "" }, { name: "" }), false);
});
