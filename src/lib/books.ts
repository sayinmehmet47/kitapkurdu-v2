import { count, desc, isNull } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "#/db";
import { book } from "#/db/schema";

export const bookPageInput = z.object({
	page: z.number().int().min(1).default(1),
	limit: z.number().int().min(1).max(50).default(12),
});

export async function listBooks(db: Database, input: unknown) {
	const { page, limit } = bookPageInput.parse(input);
	const offset = (page - 1) * limit;
	const visible = isNull(book.duplicateOfId);

	const [results, countRows] = await Promise.all([
		db
			.select()
			.from(book)
			.where(visible)
			.orderBy(desc(book.createdAt), desc(book.id))
			.limit(limit)
			.offset(offset),
		db.select({ total: count() }).from(book).where(visible),
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
