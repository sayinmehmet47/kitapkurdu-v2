import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "#/db";
import { todos } from "#/db/schema";

export const todoInput = z.object({ title: z.string().trim().min(1).max(200) });

export function listUserTodos(db: Database, userId: string) {
	return db
		.select()
		.from(todos)
		.where(eq(todos.userId, userId))
		.orderBy(desc(todos.createdAt));
}

export function insertUserTodo(db: Database, userId: string, input: unknown) {
	const data = todoInput.parse(input);
	return db
		.insert(todos)
		.values({ ...data, userId })
		.returning()
		.get();
}
