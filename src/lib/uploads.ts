import { and, count, eq, gt, isNotNull, sum } from "drizzle-orm";
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

// Spending guardrails. R2 has no hard billing cap, so the app stops accepting
// uploads before storage leaves the 10 GB free tier, and limits each account.
export const UPLOAD_LIMITS = {
	maxTotalBytes: 8 * 1024 ** 3,
	maxUploadsPerDay: 5,
};

export type UploadLimits = typeof UPLOAD_LIMITS;

/**
 * Limits for an environment. `UPLOAD_MAX_TOTAL_BYTES` (wrangler var) may lower
 * the storage ceiling, e.g. for a small test budget; it never raises it.
 */
export function uploadLimitsFor(
	maxTotalBytes: string | undefined,
): UploadLimits {
	const configured = Number(maxTotalBytes);
	return Number.isSafeInteger(configured) && configured > 0
		? {
				...UPLOAD_LIMITS,
				maxTotalBytes: Math.min(configured, UPLOAD_LIMITS.maxTotalBytes),
			}
		: UPLOAD_LIMITS;
}

/** A rejection the uploader should see verbatim (not an internal failure). */
export class UploadLimitError extends Error {}

const DAY_MS = 24 * 60 * 60 * 1000;

async function assertWithinLimits(
	db: Database,
	userId: string,
	incomingBytes: number,
	limits: UploadLimits,
) {
	const [recent, storage] = await Promise.all([
		db
			.select({ uploads: count() })
			.from(book)
			.where(
				and(
					eq(book.uploaderId, userId),
					gt(book.createdAt, new Date(Date.now() - DAY_MS)),
				),
			)
			.get(),
		// Every stored file is an R2 object, so the D1 size total tracks R2 usage.
		db
			.select({ used: sum(book.size) })
			.from(book)
			.where(isNotNull(book.fileUrl))
			.get(),
	]);

	if ((recent?.uploads ?? 0) >= limits.maxUploadsPerDay) {
		throw new UploadLimitError(
			`Bugün en fazla ${limits.maxUploadsPerDay} kitap yükleyebilirsin. Yarın tekrar dene.`,
		);
	}
	if (Number(storage?.used ?? 0) + incomingBytes > limits.maxTotalBytes) {
		throw new UploadLimitError(
			"Kitaplığın depolama alanı şu an dolu; yeni yükleme kabul edilmiyor.",
		);
	}
}

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
	limits: UploadLimits = UPLOAD_LIMITS,
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
	await assertWithinLimits(db, userId, bytes.byteLength, limits);

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
