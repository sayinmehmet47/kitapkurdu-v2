// Book covers embedded in uploaded files. Stored in R2 under covers/<book id>.

export const MAX_COVER_BYTES = 2 * 1024 * 1024;

export const COVER_TYPES = [
	"image/jpeg",
	"image/png",
	"image/gif",
	"image/webp",
] as const;

export type CoverType = (typeof COVER_TYPES)[number];

/** The image type from the file's own signature, never from a name or label. */
export function detectCoverType(bytes: Uint8Array): CoverType | undefined {
	const starts = (...signature: number[]) =>
		signature.every((byte, index) => bytes[index] === byte);
	if (starts(0xff, 0xd8, 0xff)) return "image/jpeg";
	if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))
		return "image/png";
	if (starts(0x47, 0x49, 0x46, 0x38)) return "image/gif";
	if (
		starts(0x52, 0x49, 0x46, 0x46) &&
		String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP"
	)
		return "image/webp";
	return undefined;
}

export const coverPath = (bookId: string) => `/api/books/${bookId}/cover`;
export const coverKey = (bookId: string) => `covers/${bookId}`;
