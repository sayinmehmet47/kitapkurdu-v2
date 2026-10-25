import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";
import { createDb } from "#/db";
import { getBookById } from "#/lib/books";
import {
	COVER_TYPES,
	type CoverType,
	coverKey,
	coverPath,
} from "#/lib/cover-image";

// Covers extracted from uploaded EPUBs. The catalog is public, so covers are too.
export const Route = createFileRoute("/api/books/$id/cover")({
	server: {
		handlers: {
			GET: async ({ params }) => {
				const item = await getBookById(createDb(env.DB), params.id);
				if (!item || item.coverThumbnail !== coverPath(item.id)) {
					return new Response("Bulunamadı", { status: 404 });
				}
				const object = await env.BOOKS.get(coverKey(item.id));
				const type = object?.httpMetadata?.contentType;
				// The type was taken from the image signature when it was stored.
				if (!object || !COVER_TYPES.includes(type as CoverType)) {
					return new Response("Bulunamadı", { status: 404 });
				}
				return new Response(object.body, {
					headers: {
						"content-type": type as CoverType,
						"cache-control": "public, max-age=86400",
						"content-security-policy": "default-src 'none'",
						"x-content-type-options": "nosniff",
					},
				});
			},
		},
	},
});
