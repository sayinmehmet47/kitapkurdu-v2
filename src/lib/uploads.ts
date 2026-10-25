import { and, count, eq, gt, isNotNull, sum } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "#/db";
import { book } from "#/db/schema";
import { bookFileMime, MAX_BOOK_FILE_BYTES } from "#/lib/book-file-format";
import { detectBookFormat } from "#/lib/book-files";
import {
	type BookMetadata,
	type MetadataQuery,
	safeCoverUrl,
} from "#/lib/book-metadata";
import { coverKey, coverPath } from "#/lib/cover-image";
import { readEpubMetadata } from "#/lib/epub";

export const uploadInput = z.object({
	name: z.string().trim().min(1).max(200),
	author: z.string().trim().max(200).optional(),
	publisher: z.string().trim().max(200).optional(),
	isbn: z.string().trim().max(32).optional(),
	description: z.string().trim().max(5000).optional(),
	category: z.string().trim().max(500).optional(),
	language: z.enum(["turkish", "english"]).default("turkish"),
	// From the form's Google Books preview; re-checked with safeCoverUrl.
	coverThumbnail: z.string().trim().max(2000).optional(),
	// The uploader removed the suggested cover; do not add one back on save.
	coverRemoved: z.boolean().optional(),
	fileName: z.string().trim().min(1).max(200),
	fileBase64: z.string().min(1),
});

// Keep uploads comfortably under the Workers request-body limit (base64 adds ~33%).
export const MAX_FILE_BYTES = MAX_BOOK_FILE_BYTES;

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

function decodeBase64(value: string) {
	const base64 = value.includes(",")
		? value.slice(value.indexOf(",") + 1)
		: value;
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes;
}

export async function createBookWithFile(
	db: Database,
	bucket: R2Bucket,
	userId: string,
	input: unknown,
	limits: UploadLimits = UPLOAD_LIMITS,
	lookup?: (query: MetadataQuery) => Promise<BookMetadata | null>,
) {
	const data = uploadInput.parse(input);
	const bytes = decodeBase64(data.fileBase64);
	const format = detectBookFormat(bytes);
	// The EPUB's own package metadata and cover, read from the uploaded bytes
	// (never trusted from the browser).
	const file = format === "epub" ? readEpubMetadata(bytes) : {};
	const embeddedCover = data.coverRemoved ? undefined : file.cover;
	await assertWithinLimits(
		db,
		userId,
		bytes.byteLength + (embeddedCover?.bytes.byteLength ?? 0),
		limits,
	);

	const typedCategories = (data.category ?? "")
		.split(",")
		.map((item) => item.trim())
		.filter(Boolean);
	const category =
		typedCategories.length > 0 ? typedCategories : (file.categories ?? []);
	const author = data.author || file.author;
	const publisher = data.publisher || file.publisher;
	const isbn = data.isbn || file.isbn;
	const description = data.description || file.description;
	const cover = safeCoverUrl(data.coverThumbnail);

	// Fill only what is still empty; typed values, then the file's own details,
	// always win. A failed lookup returns null and the upload continues.
	const missing =
		!author ||
		!publisher ||
		!isbn ||
		!description ||
		category.length === 0 ||
		(!embeddedCover && !cover && !data.coverRemoved);
	const found =
		lookup && missing ? await lookup({ isbn, name: data.name, author }) : null;

	const id = crypto.randomUUID();
	const key = `${userId}/${crypto.randomUUID()}.${format}`;
	await bucket.put(key, bytes, {
		httpMetadata: { contentType: bookFileMime(format) },
	});
	if (embeddedCover) {
		await bucket.put(coverKey(id), embeddedCover.bytes, {
			httpMetadata: { contentType: embeddedCover.type },
		});
	}

	return db
		.insert(book)
		.values({
			id,
			name: data.name,
			author: author || found?.author || null,
			publisher: publisher || found?.publisher || null,
			isbn: isbn || found?.isbn || null,
			description: description || found?.description || null,
			category: category.length > 0 ? category : (found?.categories ?? []),
			coverThumbnail: data.coverRemoved
				? null
				: embeddedCover
					? coverPath(id)
					: (cover ?? found?.coverThumbnail ?? null),
			coverSmallThumbnail:
				data.coverRemoved || embeddedCover || cover
					? null
					: (found?.coverSmallThumbnail ?? null),
			language: data.language,
			fileUrl: key,
			size: bytes.byteLength,
			uploaderId: userId,
		})
		.returning()
		.get();
}
