import {
	BookFileError,
	type BookFileFormat,
	MAX_BOOK_FILE_BYTES,
} from "#/lib/book-file-format";
import { inspectEpub } from "#/lib/epub";

export function detectBookFormat(bytes: Uint8Array): BookFileFormat {
	if (bytes.length === 0) throw new BookFileError("Dosya boş.");
	if (bytes.length > MAX_BOOK_FILE_BYTES)
		throw new BookFileError("Dosya çok büyük (en fazla 25 MB).");
	if (new TextDecoder().decode(bytes.subarray(0, 5)) === "%PDF-") return "pdf";
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
