import { and, avg, count, desc, eq } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "#/db";
import { rating, user } from "#/db/schema";

export const ratingInput = z.object({
	bookId: z.string().min(1).max(64),
	rating: z.number().int().min(1).max(5),
	review: z.string().trim().max(2000).optional(),
});

export function listRatings(db: Database, bookId: string) {
	return db
		.select({
			id: rating.id,
			rating: rating.rating,
			review: rating.review,
			createdAt: rating.createdAt,
			username: user.name,
		})
		.from(rating)
		.innerJoin(user, eq(rating.userId, user.id))
		.where(eq(rating.bookId, bookId))
		.orderBy(desc(rating.createdAt));
}

export async function getRatingSummary(db: Database, bookId: string) {
	const row = await db
		.select({ average: avg(rating.rating), count: count() })
		.from(rating)
		.where(eq(rating.bookId, bookId))
		.get();
	return {
		average: Number(row?.average ?? 0),
		count: row?.count ?? 0,
	};
}

export function getMyRating(db: Database, bookId: string, userId: string) {
	return db
		.select()
		.from(rating)
		.where(and(eq(rating.bookId, bookId), eq(rating.userId, userId)))
		.get();
}

export async function upsertRating(
	db: Database,
	userId: string,
	input: unknown,
) {
	const data = ratingInput.parse(input);
	const existing = await getMyRating(db, data.bookId, userId);
	if (existing) {
		return db
			.update(rating)
			.set({ rating: data.rating, review: data.review ?? null })
			.where(eq(rating.id, existing.id))
			.returning()
			.get();
	}
	return db
		.insert(rating)
		.values({
			bookId: data.bookId,
			userId,
			rating: data.rating,
			review: data.review ?? null,
		})
		.returning()
		.get();
}
