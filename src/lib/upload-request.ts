// The upload page sends the book file as the raw request body and the typed
// details in a header, so the Worker can pipe the file to R2 without decoding
// it (base64 decoding a large file would exceed the Free plan's CPU limit).
import type { BookFileFormat } from "#/lib/book-file-format";

export const UPLOAD_PATH = "/api/books/upload";
export const FORMAT_HEADER = "x-book-format";
export const DETAILS_HEADER = "x-book-details";

export type UploadResponse =
	| { ok: true; id: string }
	| { ok: false; error: string };

/** UTF-8 JSON as base64, so Turkish text survives the header. */
export function encodeDetails(details: unknown) {
	const bytes = new TextEncoder().encode(JSON.stringify(details));
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary);
}

/** Undefined when the header is missing or malformed; validation rejects it. */
export function decodeDetails(header: string | null): unknown {
	if (!header) return undefined;
	try {
		const binary = atob(header);
		const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
		return JSON.parse(new TextDecoder().decode(bytes));
	} catch {
		return undefined;
	}
}

/** The claimed format, from the file's first bytes; the server re-checks. */
export async function sniffBookFormat(
	file: Blob,
): Promise<BookFileFormat | null> {
	const head = new Uint8Array(await file.slice(0, 5).arrayBuffer());
	if (new TextDecoder().decode(head) === "%PDF-") return "pdf";
	if (head[0] === 0x50 && head[1] === 0x4b) return "epub";
	return null;
}

/**
 * Uploads a book: the file is the raw request body (streamed to storage by the
 * Worker) and the details travel in a header. Reports progress from 0 to 1.
 */
export function uploadBook(
	file: Blob,
	format: BookFileFormat,
	details: unknown,
	onProgress?: (share: number) => void,
) {
	return new Promise<UploadResponse>((resolve, reject) => {
		const request = new XMLHttpRequest();
		request.open("PUT", UPLOAD_PATH);
		request.setRequestHeader(FORMAT_HEADER, format);
		request.setRequestHeader(DETAILS_HEADER, encodeDetails(details));
		request.responseType = "json";
		request.upload.onprogress = (event) => {
			if (event.lengthComputable) onProgress?.(event.loaded / event.total);
		};
		request.onload = () => {
			const body = request.response as UploadResponse | null;
			if (body && typeof body.ok === "boolean") resolve(body);
			else reject(new Error(`HTTP ${request.status}`));
		};
		request.onerror = () => reject(new Error("Network error"));
		request.send(file);
	});
}
