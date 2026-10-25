export type BookActor = { id: string; role?: string };

export function canDeleteBook(
	actor: BookActor | null,
	item: { uploaderId: string | null },
) {
	return Boolean(
		actor && (actor.role === "admin" || actor.id === item.uploaderId),
	);
}
