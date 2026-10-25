import { z } from "zod";
import type { Database } from "#/db";
import { book } from "#/db/schema";

export const uploadInput = z.object({
	name: z.string().trim().min(1).max(200),
	author: z.string().trim().max(200).optional(),
	publisher: z.string().trim().max(200).optional(),
	isbn: z.string().trim().max(32).optional(),
	description: z.string().trim().max(5000).optional(),
	category: z.string().trim().max(500).optional(),
	language: z.enum(["turkish", "english"]).default("turkish"),
	fileName: z.string().trim().min(1).max(200),
	fileBase64: z.string().min(1),
});

// Keep uploads comfortably under the Workers request-body limit (base64 adds ~33%).
export const MAX_FILE_BYTES = 25 * 1024 * 1024;

const PDF_HEADER = "%PDF-";

function decodeBase64(value: string) {
	const base64 = value.includes(",")
		? value.slice(value.indexOf(",") + 1)
		: value;
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes;
}

function isPdf(bytes: Uint8Array) {
	if (bytes.byteLength < PDF_HEADER.length) return false;
	for (let i = 0; i < PDF_HEADER.length; i++) {
		if (bytes[i] !== PDF_HEADER.charCodeAt(i)) return false;
	}
	return true;
}

export async function createBookWithFile(
	db: Database,
	bucket: R2Bucket,
	userId: string,
	input: unknown,
) {
	const data = uploadInput.parse(input);
	const bytes = decodeBase64(data.fileBase64);
	if (bytes.byteLength === 0) throw new Error("Dosya boş.");
	if (bytes.byteLength > MAX_FILE_BYTES) {
		throw new Error("Dosya çok büyük (en fazla 25 MB).");
	}
	if (!isPdf(bytes)) {
		throw new Error("Yalnızca PDF dosyaları yüklenebilir.");
	}

	const category = (data.category ?? "")
		.split(",")
		.map((item) => item.trim())
		.filter(Boolean);

	// Only PDFs are stored, so force a safe content type and extension: the
	// download route serves these inline on the application origin.
	const key = `${userId}/${crypto.randomUUID()}.pdf`;
	await bucket.put(key, bytes, {
		httpMetadata: { contentType: "application/pdf" },
	});

	return db
		.insert(book)
		.values({
			name: data.name,
			author: data.author || null,
			publisher: data.publisher || null,
			isbn: data.isbn || null,
			description: data.description || null,
			category,
			language: data.language,
			fileUrl: key,
			size: bytes.byteLength,
			uploaderId: userId,
		})
		.returning()
		.get();
}
