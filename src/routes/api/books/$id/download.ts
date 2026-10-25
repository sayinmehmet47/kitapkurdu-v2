import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";
import { createDb } from "#/db";
import { bookFileHeaders, storedBookFormat } from "#/lib/book-file-format";
import { getBookById } from "#/lib/books";

export const Route = createFileRoute("/api/books/$id/download")({
	server: {
		handlers: {
			GET: async ({ params, request }) => {
				const item = await getBookById(createDb(env.DB), params.id);
				if (!item?.fileUrl) {
					return new Response("Bulunamadı", { status: 404 });
				}
				const format = storedBookFormat(item.fileUrl);
				if (!format) return new Response("Bulunamadı", { status: 404 });
				const object = await env.BOOKS.get(item.fileUrl);
				if (!object) {
					return new Response("Bulunamadı", { status: 404 });
				}
				return new Response(object.body, {
					headers: bookFileHeaders(
						format,
						item.id,
						object.size,
						new URL(request.url).searchParams.get("download") === "1",
					),
				});
			},
		},
	},
});
