import { and, count, desc, eq, isNull, like, or, type SQL } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "#/db";
import { book } from "#/db/schema";

export const bookPageInput = z.object({
	page: z.number().int().min(1).default(1),
	limit: z.number().int().min(1).max(50).default(12),
	q: z.string().trim().max(200).optional(),
	language: z.enum(["turkish", "english"]).optional(),
	category: z.string().trim().max(100).optional(),
});

export async function listBooks(db: Database, input: unknown) {
	const { page, limit, q, language, category } = bookPageInput.parse(input);
	const offset = (page - 1) * limit;

	const conditions: (SQL<unknown> | undefined)[] = [isNull(book.duplicateOfId)];

	if (q) {
		// D1 has no full-text index; MVP uses LIKE (case-insensitive for ASCII).
		// Turkish accent folding and FTS5 are a follow-up.
		conditions.push(
			or(
				like(book.name, `%${q}%`),
				like(book.author, `%${q}%`),
				like(book.description, `%${q}%`),
				like(book.isbn, `%${q}%`),
				like(book.publisher, `%${q}%`),
			),
		);
	}

	if (language) conditions.push(eq(book.language, language));

	if (category) {
		// Category is stored as a JSON array; match the quoted element.
		conditions.push(like(book.category, `%"${category}"%`));
	}

	const where = and(...conditions);
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

export async function getBookById(db: Database, id: string) {
	return db
		.select()
		.from(book)
		.where(and(eq(book.id, id), isNull(book.duplicateOfId)))
		.get();
}

export async function listCategories(db: Database) {
	const rows = await db
		.select({ category: book.category })
		.from(book)
		.where(isNull(book.duplicateOfId));
	const categories = new Set<string>();
	for (const row of rows) {
		for (const item of row.category ?? []) categories.add(item);
	}
	return [...categories].sort();
}

export const bookUpdateInput = z.object({
	name: z.string().trim().min(1).max(200),
	author: z.string().trim().max(200).optional(),
	publisher: z.string().trim().max(200).optional(),
	isbn: z.string().trim().max(32).optional(),
	description: z.string().trim().max(5000).optional(),
	category: z.string().trim().max(500).optional(),
	language: z.enum(["turkish", "english"]).default("turkish"),
});

export function updateBook(db: Database, id: string, input: unknown) {
	const data = bookUpdateInput.parse(input);
	const category = (data.category ?? "")
		.split(",")
		.map((item) => item.trim())
		.filter(Boolean);
	return db
		.update(book)
		.set({
			name: data.name,
			author: data.author || null,
			publisher: data.publisher || null,
			isbn: data.isbn || null,
			description: data.description || null,
			category,
			language: data.language,
		})
		.where(eq(book.id, id))
		.returning()
		.get();
}

export function deleteBookById(db: Database, id: string) {
	return db.delete(book).where(eq(book.id, id)).returning().get();
}

export function markBookDuplicate(
	db: Database,
	id: string,
	canonicalId: string,
) {
	return db
		.update(book)
		.set({ duplicateOfId: canonicalId })
		.where(eq(book.id, id))
		.returning()
		.get();
}
