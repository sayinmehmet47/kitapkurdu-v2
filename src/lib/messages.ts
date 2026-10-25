import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "#/db";
import { message, user } from "#/db/schema";

export const messageInput = z.object({
	text: z.string().trim().min(1).max(500),
});

export function listMessages(db: Database, limit = 50) {
	return db
		.select({
			id: message.id,
			text: message.text,
			createdAt: message.createdAt,
			username: user.name,
		})
		.from(message)
		.innerJoin(user, eq(message.userId, user.id))
		.orderBy(desc(message.createdAt))
		.limit(limit);
}

export function postMessage(db: Database, userId: string, input: unknown) {
	const data = messageInput.parse(input);
	return db
		.insert(message)
		.values({ text: data.text, userId })
		.returning()
		.get();
}
