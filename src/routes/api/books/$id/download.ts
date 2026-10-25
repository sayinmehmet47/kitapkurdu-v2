import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";
import { createDb } from "#/db";
import { getBookById } from "#/lib/books";

export const Route = createFileRoute("/api/books/$id/download")({
	server: {
		handlers: {
			GET: async ({ params }) => {
				const item = await getBookById(createDb(env.DB), params.id);
				if (!item?.fileUrl) {
					return new Response("Bulunamadı", { status: 404 });
				}
				const object = await env.BOOKS.get(item.fileUrl);
				if (!object) {
					return new Response("Bulunamadı", { status: 404 });
				}
				// Uploads are validated as PDFs; force a safe type and use the
				// opaque book id as the filename so no user text reaches headers.
				return new Response(object.body, {
					headers: {
						"content-type": "application/pdf",
						"content-disposition": `inline; filename="${item.id}.pdf"`,
						"x-content-type-options": "nosniff",
					},
				});
			},
		},
	},
});
