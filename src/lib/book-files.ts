import {
	BookFileError,
	type BookFileFormat,
	MAX_BOOK_FILE_BYTES,
} from "#/lib/book-file-format";
import { inspectEpub } from "#/lib/epub";

/**
 * PDF or EPUB from the file's own bytes. With `headerOnly`, only the first
 * bytes are given and only a PDF signature can be confirmed.
 */
export function detectBookFormat(
	bytes: Uint8Array,
	{ headerOnly = false } = {},
): BookFileFormat {
	if (bytes.length === 0) throw new BookFileError("Dosya boş.");
	if (bytes.length > MAX_BOOK_FILE_BYTES)
		throw new BookFileError(
			`Dosya çok büyük (en fazla ${MAX_BOOK_FILE_BYTES / 1024 ** 2} MB).`,
		);
	if (new TextDecoder().decode(bytes.subarray(0, 5)) === "%PDF-") return "pdf";
	if (headerOnly)
		throw new BookFileError("Yalnızca PDF veya EPUB dosyaları yüklenebilir.");
	if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
		try {
			inspectEpub(bytes);
			return "epub";
		} catch {
			throw new BookFileError(
				"EPUB dosyası geçersiz, şifreli veya önizleme sınırlarını aşıyor.",
			);
		}
	}
	throw new BookFileError("Yalnızca PDF veya EPUB dosyaları yüklenebilir.");
}
