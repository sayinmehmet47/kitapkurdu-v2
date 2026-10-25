import { and, count, desc, isNull, like, or } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "#/db";
import { book } from "#/db/schema";

export const bookPageInput = z.object({
	page: z.number().int().min(1).default(1),
	limit: z.number().int().min(1).max(50).default(12),
	q: z.string().trim().max(200).optional(),
});

export async function listBooks(db: Database, input: unknown) {
	const { page, limit, q } = bookPageInput.parse(input);
	const offset = (page - 1) * limit;

	// D1 has no full-text index; MVP uses LIKE (case-insensitive for ASCII).
	// Turkish accent folding and FTS5 are a follow-up.
	const where = q
		? and(
				isNull(book.duplicateOfId),
				or(
					like(book.name, `%${q}%`),
					like(book.author, `%${q}%`),
					like(book.description, `%${q}%`),
					like(book.isbn, `%${q}%`),
					like(book.publisher, `%${q}%`),
				),
			)
		: isNull(book.duplicateOfId);
	const [results, countRows] = await Promise.all([
		db
			.select()
			.from(book)
			.where(where)
			.orderBy(desc(book.createdAt), desc(book.id))
			.limit(limit)
			.offset(offset),
		db.select({ total: count() }).from(book).where(where),
	]);

	const total = countRows[0]?.total ?? 0;
	return {
		results,
		total,
		page,
		limit,
		pageCount: Math.max(1, Math.ceil(total / limit)),
	};
}
