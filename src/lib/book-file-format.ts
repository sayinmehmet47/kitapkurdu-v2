export const MAX_BOOK_FILE_BYTES = 25 * 1024 * 1024;
export const BOOK_FILE_ACCEPT =
	".pdf,.epub,application/pdf,application/epub+zip";
export type BookFileFormat = "pdf" | "epub";

export class BookFileError extends Error {}

export function bookFileMime(format: BookFileFormat) {
	return format === "epub" ? "application/epub+zip" : "application/pdf";
}

export function storedBookFormat(key: string | null): BookFileFormat | null {
	if (key?.endsWith(".epub")) return "epub";
	if (key?.endsWith(".pdf")) return "pdf";
	return null;
}

export function bookFileHeaders(
	format: BookFileFormat,
	id: string,
	size: number,
	download = false,
) {
	// Filename is generated from a UUID, never from an uploaded title/filename.
	const safeId = id.replace(/[^a-zA-Z0-9_-]/g, "");
	return new Headers({
		"content-type": bookFileMime(format),
		"content-disposition": `${download || format === "epub" ? "attachment" : "inline"}; filename="${safeId}.${format}"`,
		"content-length": String(size),
		"x-content-type-options": "nosniff",
	});
}
