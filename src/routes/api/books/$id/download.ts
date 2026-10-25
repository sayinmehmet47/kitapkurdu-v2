import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";
import { createDb } from "#/db";
import { bookFileHeaders, storedBookFormat } from "#/lib/book-file-format";
import { getBookById } from "#/lib/books";
import { parseByteRange } from "#/lib/byte-range";

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

				const requestedRange = request.headers.get("range");
				const download =
					new URL(request.url).searchParams.get("download") === "1";

				if (requestedRange !== null) {
					// PDF.js can request small pieces instead of fetching the whole book.
					// R2 needs the size first to resolve open-ended and suffix ranges.
					const metadata = await env.BOOKS.head(item.fileUrl);
					if (!metadata) return new Response("Bulunamadı", { status: 404 });
					const range = parseByteRange(requestedRange, metadata.size);
					if (!range) {
						return new Response(null, {
							status: 416,
							headers: {
								"accept-ranges": "bytes",
								"content-range": `bytes */${metadata.size}`,
							},
						});
					}
					const object = await env.BOOKS.get(item.fileUrl, { range });
					if (!object) return new Response("Bulunamadı", { status: 404 });
					const headers = bookFileHeaders(
						format,
						item.id,
						range.length,
						download,
					);
					headers.set("accept-ranges", "bytes");
					headers.set(
						"content-range",
						`bytes ${range.offset}-${range.offset + range.length - 1}/${metadata.size}`,
					);
					return new Response(object.body, { status: 206, headers });
				}

				const object = await env.BOOKS.get(item.fileUrl);
				if (!object) return new Response("Bulunamadı", { status: 404 });
				const headers = bookFileHeaders(format, item.id, object.size, download);
				headers.set("accept-ranges", "bytes");
				return new Response(object.body, { headers });
			},
		},
	},
});
