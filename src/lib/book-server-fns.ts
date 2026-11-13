// Server functions shared by the upload and bulk import pages.
import { env } from "cloudflare:workers";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { z } from "zod";
import { createDb } from "#/db";
import { getAuth } from "#/lib/auth";
import { lookupBookMetadata } from "#/lib/book-metadata";
import { findExistingBook } from "#/lib/books";
import { metadataConfig } from "#/lib/metadata-config";

async function currentSession() {
	return getAuth().api.getSession({ headers: getRequestHeaders() });
}

export const getUploaderContext = createServerFn({ method: "GET" }).handler(
	async () => {
		const session = await currentSession();
		return {
			isSignedIn: Boolean(session),
			isAdmin: session?.user?.role === "admin",
		};
	},
);

export const lookupMetadata = createServerFn({ method: "POST" })
	.validator(
		z.object({
			isbn: z.string().trim().max(32).optional(),
			name: z.string().trim().max(200).optional(),
			author: z.string().trim().max(200).optional(),
		}),
	)
	.handler(async ({ data }) => {
		// Signed-in only, so anonymous traffic cannot spend the shared quota.
		if (!(await currentSession()))
			throw new Error("Sign in before looking up books.");
		return lookupBookMetadata(data, metadataConfig());
	});

/** The id of a listed book that matches, for the admin's bulk import. */
export const checkExistingBook = createServerFn({ method: "POST" })
	.validator(
		z.object({
			name: z.string().trim().max(200),
			author: z.string().trim().max(200).optional(),
			isbn: z.string().trim().max(32).optional(),
		}),
	)
	.handler(async ({ data }) => {
		const session = await currentSession();
		if (session?.user?.role !== "admin")
			throw new Error("Only admins can import books.");
		return { id: await findExistingBook(createDb(env.DB), data) };
	});
