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
				// A book's stored file never changes, so the browser keeps it and
				// reopening a book does not download it again; after a week it only
				// revalidates (304) with the ETag.
				const ifNoneMatch = request.headers.get("if-none-match");
				const object = await env.BOOKS.get(item.fileUrl, {
					onlyIf: ifNoneMatch
						? new Headers({ "if-none-match": ifNoneMatch })
						: undefined,
				});
				if (!object) {
					return new Response("Bulunamadı", { status: 404 });
				}
				const cache = {
					etag: object.httpEtag,
					"cache-control": "private, max-age=604800",
				};
				if (!("body" in object)) {
					return new Response(null, { status: 304, headers: cache });
				}
				const headers = bookFileHeaders(
					format,
					item.id,
					object.size,
					new URL(request.url).searchParams.get("download") === "1",
				);
				for (const [name, value] of Object.entries(cache))
					headers.set(name, value);
				return new Response(object.body, { headers });
			},
		},
	},
});
