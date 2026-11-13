// Book details for the bulk import page: what a file says about itself,
// completed from an online match, and whether a book is already listed.
import type { FileMetadata } from "#/lib/book-file-metadata";
import type { BookMetadata, MetadataSource } from "#/lib/book-metadata";
import { normalizeIsbn } from "#/lib/isbn";

export const SOURCE_NAMES: Record<MetadataSource, string> = {
	google: "Google Books",
	openlibrary: "Open Library",
};

export type ImportDetails = {
	name: string;
	author: string;
	publisher: string;
	isbn: string;
	description: string;
	category: string;
	language: "turkish" | "english";
	coverThumbnail?: string;
};

export function detailsFromFile(metadata: FileMetadata): ImportDetails {
	return {
		name: metadata.title ?? "",
		author: metadata.author ?? "",
		publisher: metadata.publisher ?? "",
		isbn: metadata.isbn ?? "",
		description: metadata.description ?? "",
		category: metadata.categories?.join(", ") ?? "",
		language: metadata.language ?? "turkish",
	};
}

/**
 * Fills only what is still empty from an online match, like the single
 * upload form; a title that is only a guess from the file name is replaced.
 */
export function completeDetails(
	details: ImportDetails,
	found: BookMetadata,
	{ nameIsGuess = false } = {},
): ImportDetails {
	const pick = (current: string, next?: string) =>
		current.trim() || next?.trim() || "";
	return {
		...details,
		name:
			nameIsGuess && found.title?.trim()
				? found.title.trim()
				: pick(details.name, found.title),
		author: pick(details.author, found.author),
		publisher: pick(details.publisher, found.publisher),
		isbn: pick(details.isbn, found.isbn),
		description: pick(details.description, found.description),
		category: pick(details.category, found.categories?.join(", ")),
		coverThumbnail: details.coverThumbnail ?? found.coverThumbnail,
	};
}

type Comparable = {
	name: string | null;
	author?: string | null;
	isbn?: string | null;
};

// Case, Turkish dotted/dotless i, accents and punctuation do not matter.
const comparable = (value: string | null | undefined) =>
	(value ?? "")
		.toLocaleLowerCase("tr")
		.replace(/ı/g, "i")
		.normalize("NFKD")
		.replace(/\p{M}/gu, "")
		.replace(/[^\p{L}\p{N}]+/gu, " ")
		.trim();

/**
 * The same ISBN, or the same title by the same author (an unknown author on
 * either side still counts). Used to flag books that are already listed.
 */
export function sameBook(a: Comparable, b: Comparable) {
	const isbnA = normalizeIsbn(a.isbn);
	if (isbnA && isbnA === normalizeIsbn(b.isbn)) return true;
	const name = comparable(a.name);
	if (!name || name !== comparable(b.name)) return false;
	const authorA = comparable(a.author);
	const authorB = comparable(b.author);
	return !authorA || !authorB || authorA === authorB;
}
