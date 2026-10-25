/** A valid ISBN-13 or ISBN-10 (checksum verified), digits only, else undefined. */
export function normalizeIsbn(value: string | undefined | null) {
	const raw = (value ?? "")
		.replace(/^\s*(?:urn:)?isbn:?/i, "")
		.replace(/[\s-]/g, "")
		.toUpperCase();
	if (/^97[89]\d{10}$/.test(raw)) {
		const sum = [...raw.slice(0, 12)].reduce(
			(total, digit, index) => total + Number(digit) * (index % 2 ? 3 : 1),
			0,
		);
		return (10 - (sum % 10)) % 10 === Number(raw[12]) ? raw : undefined;
	}
	if (/^\d{9}[\dX]$/.test(raw)) {
		const sum = [...raw].reduce(
			(total, char, index) =>
				total + (char === "X" ? 10 : Number(char)) * (10 - index),
			0,
		);
		return sum % 11 === 0 ? raw : undefined;
	}
	return undefined;
}

// "ISBN 978-605-…", "ISBN-10: 0-306-40615-2", "ISBN13 9786051234567".
const LABELLED_ISBN =
	/ISBN(?:[\s-]?1[03])?[\s:]*(97[89](?:[\s-]?\d){10}|\d(?:[\s-]?\d){8}[\s-]?[\dX])(?!\d)/gi;
// An unlabelled 13-digit number starting with the book prefixes.
const BARE_ISBN = /(?<!\d)97[89](?:[\s-]?\d){10}(?!\d)/g;

/**
 * The first valid ISBN in a book's text (copyright page, back cover).
 * Labelled numbers win; checksums filter out phone numbers and the like.
 */
export function findIsbn(text: string) {
	for (const pattern of [LABELLED_ISBN, BARE_ISBN]) {
		for (const match of text.matchAll(pattern)) {
			const isbn = normalizeIsbn(match[1] ?? match[0]);
			if (isbn) return isbn;
		}
	}
	return undefined;
}
