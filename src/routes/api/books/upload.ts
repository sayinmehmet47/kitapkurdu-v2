import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { createDb } from "#/db";
import { getAuth } from "#/lib/auth";
import { BookFileError } from "#/lib/book-file-format";
import { lookupBookMetadata } from "#/lib/book-metadata";
import { metadataConfig } from "#/lib/metadata-config";
import {
	DETAILS_HEADER,
	decodeDetails,
	FORMAT_HEADER,
	type UploadResponse,
} from "#/lib/upload-request";
import {
	storeUploadedBook,
	UploadLimitError,
	uploadLimitsFor,
} from "#/lib/uploads";

function reply(body: UploadResponse, status = 200) {
	return Response.json(body, { status });
}

export const Route = createFileRoute("/api/books/upload")({
	server: {
		handlers: {
			// PUT with custom headers always needs a CORS preflight, which this
			// route never grants, so other sites cannot upload with a visitor's cookie.
			PUT: async ({ request }) => {
				const session = await getAuth().api.getSession({
					headers: request.headers,
				});
				if (!session) {
					return reply({ ok: false, error: "Yüklemek için giriş yap." }, 401);
				}
				const format = request.headers.get(FORMAT_HEADER);
				const size = Number(request.headers.get("content-length"));
				if (!request.body || (format !== "pdf" && format !== "epub")) {
					return reply(
						{
							ok: false,
							error: "Yalnızca PDF veya EPUB dosyaları yüklenebilir.",
						},
						400,
					);
				}
				if (!Number.isSafeInteger(size)) {
					return reply({ ok: false, error: "Dosya boyutu bilinmiyor." }, 411);
				}
				const limits = uploadLimitsFor(env.UPLOAD_MAX_TOTAL_BYTES);
				try {
					const row = await storeUploadedBook({
						db: createDb(env.DB),
						bucket: env.BOOKS,
						userId: session.user.id,
						details: decodeDetails(request.headers.get(DETAILS_HEADER)),
						body: request.body,
						size,
						format,
						// Admins add books in bulk; the storage ceiling still applies.
						limits:
							session.user.role === "admin"
								? { ...limits, maxUploadsPerDay: Number.POSITIVE_INFINITY }
								: limits,
						lookup: async (query) => {
							const result = await lookupBookMetadata(query, metadataConfig());
							return result.status === "found" ? result.metadata : null;
						},
					});
					return reply({ ok: true, id: row.id });
				} catch (error) {
					// Rejections are meant for the uploader and are an ordinary answer
					// (200, like a form message); anything else stays generic.
					if (
						error instanceof UploadLimitError ||
						error instanceof BookFileError
					) {
						return reply({ ok: false, error: error.message });
					}
					if (error instanceof z.ZodError) {
						return reply({ ok: false, error: "Kitap bilgileri geçersiz." });
					}
					throw error;
				}
			},
		},
	},
});
