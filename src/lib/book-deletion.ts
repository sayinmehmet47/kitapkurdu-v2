import { and, eq, lt, ne } from "drizzle-orm";
import type { Database } from "#/db";
import { book, deletedBookUpload } from "#/db/schema";
import { type BookActor, canDeleteBook } from "#/lib/book-permissions";

export class BookDeletionError extends Error {}

export async function deleteBookWithFile(
	db: Database,
	bucket: Pick<R2Bucket, "delete">,
	id: string,
	actor: BookActor | null,
) {
	if (!actor)
		throw new BookDeletionError("Kitap silmek için giriş yapmalısın.");
	// Do not use the public lookup: admins may also need to delete hidden duplicates.
	const item = await db.select().from(book).where(eq(book.id, id)).get();
	if (!item || !canDeleteBook(actor, item)) {
		throw new BookDeletionError(
			"Bu kitabı silme iznin yok veya kitap artık mevcut değil.",
		);
	}
	if (item.fileUrl && !/^https?:\/\//.test(item.fileUrl)) {
		if (!/^[a-zA-Z0-9_-]+\/[0-9a-f-]{36}\.(pdf|epub)$/.test(item.fileUrl)) {
			throw new BookDeletionError(
				"Dosya kaydı doğrulanamadı. Yöneticiyle iletişime geç.",
			);
		}
		const shared = await db
			.select({ id: book.id })
			.from(book)
			.where(and(eq(book.fileUrl, item.fileUrl), ne(book.id, item.id)))
			.limit(1)
			.get();
		// Keys come from D1, never the mutation input. External links are not R2
		// objects, and a shared file must remain available to its other records.
		if (!shared) await bucket.delete(item.fileUrl);
	}

	const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
	// R2 first: failed object deletion must not free the D1 storage budget. D1's
	// batch then keeps the receipt and row deletion atomic. If D1 fails after R2
	// succeeds, retain the row/accounting and allow an idempotent R2 retry.
	const deleteRow = db.delete(book).where(eq(book.id, item.id));
	const pruneReceipts = db
		.delete(deletedBookUpload)
		.where(lt(deletedBookUpload.uploadedAt, cutoff));
	if (item.uploaderId) {
		await db.batch([
			db
				.insert(deletedBookUpload)
				.values({
					bookId: item.id,
					uploaderId: item.uploaderId,
					uploadedAt: item.createdAt,
				})
				.onConflictDoNothing(),
			deleteRow,
			pruneReceipts,
		]);
	} else {
		// Seeds without an uploader have no per-account limit to preserve.
		await db.batch([deleteRow, pruneReceipts]);
	}
}
