import { Buffer } from "node:buffer";
import type { Page } from "@playwright/test";
import {
	DETAILS_HEADER,
	encodeDetails,
	FORMAT_HEADER,
	UPLOAD_PATH,
} from "../../src/lib/upload-request";
import { samplePdf } from "../fixtures/book-files";
import { capture, expect, openUploadForm, signUp, test } from "./fixtures";

const tinyPdf = Buffer.from("%PDF-1.4\n% synthetic transport test\n");

function put(
	page: Page,
	details: unknown,
	format: string,
	body: Buffer = tinyPdf,
) {
	// page.request shares the signed-in browser context's cookies.
	return page.request.put(UPLOAD_PATH, {
		headers: {
			[FORMAT_HEADER]: format,
			[DETAILS_HEADER]: encodeDetails(details),
			"content-type": "application/octet-stream",
		},
		data: body,
	});
}

test("the upload route streams the file and refuses bad requests", async ({
	page,
}) => {
	const anonymous = await put(page, { name: "Anonim" }, "pdf");
	expect(anonymous.status()).toBe(401);

	await signUp(page);
	const uploaded = await put(
		page,
		{ name: "Akış Kitabı", author: "Ş. Ğ." },
		"pdf",
	);
	expect(uploaded.status()).toBe(200);
	const { id } = (await uploaded.json()) as { id: string };
	const download = await page.request.get(`/api/books/${id}/download`);
	expect(Buffer.from(await download.body())).toEqual(tinyPdf);
	await page.goto(`/books/${id}`);
	await expect(
		page.getByRole("heading", { name: "Akış Kitabı" }),
	).toBeVisible();

	// The stored bytes, not the claimed format, decide; nothing is created.
	const mismatch = await put(page, { name: "Yanlış Biçim" }, "epub");
	expect(mismatch.status()).toBe(200);
	expect(await mismatch.json()).toEqual({
		ok: false,
		error: "Yalnızca PDF veya EPUB dosyaları yüklenebilir.",
	});
	const notABook = await put(
		page,
		{ name: "Kitap Değil" },
		"pdf",
		Buffer.from("plain text"),
	);
	expect(((await notABook.json()) as { ok: boolean }).ok).toBe(false);
	const noDetails = await put(page, { name: "" }, "pdf");
	expect(await noDetails.json()).toEqual({
		ok: false,
		error: "Kitap bilgileri geçersiz.",
	});
	for (const name of ["Yanlış Biçim", "Kitap Değil"]) {
		await page.goto(`/books?q=${encodeURIComponent(name)}`);
		await expect(page.getByRole("heading", { name })).toHaveCount(0);
	}
});

test("the daily upload limit applies to readers but not to admins", async ({
	page,
}) => {
	await signUp(page);
	for (let index = 1; index <= 5; index++) {
		expect((await put(page, { name: `Okur ${index}` }, "pdf")).status()).toBe(
			200,
		);
	}
	const sixth = await put(page, { name: "Okur 6" }, "pdf");
	expect(((await sixth.json()) as { error: string }).error).toContain(
		"Bugün en fazla 5",
	);

	await page.context().clearCookies();
	const password = process.env.E2E_ADMIN_PASSWORD;
	if (!password) throw new Error("The isolated E2E admin password is missing.");
	await page.goto("/sign-in");
	await page.getByLabel("E-posta", { exact: true }).fill("admin@example.test");
	await page.getByLabel("Şifre", { exact: true }).fill(password);
	await page
		.getByRole("main")
		.getByRole("button", { name: "Giriş yap", exact: true })
		.click();
	await expect(page.getByRole("heading", { name: "Hoş geldin" })).toBeVisible();
	for (let index = 1; index <= 6; index++) {
		expect(
			(await put(page, { name: `Yönetici toplu ${index}` }, "pdf")).status(),
		).toBe(200);
	}
});

test("choosing a PDF finds the ISBN printed inside it", async ({
	page,
}, info) => {
	await signUp(page);
	await openUploadForm(page);
	await page.locator('input[type="file"]').setInputFiles({
		name: "kunye.pdf",
		mimeType: "application/pdf",
		buffer: Buffer.from(
			samplePdf([
				"Birinci sayfa",
				"Yapi Kredi Yayinlari ISBN 978-975-07-1938-7",
			]),
		),
	});
	await expect(page.getByLabel("ISBN", { exact: true })).toHaveValue(
		"9789750719387",
	);
	// "kunye" was only a guess from the file name; the found title replaces it.
	await expect(page.getByLabel("Ad", { exact: true })).toHaveValue(
		"Kürk Mantolu Madonna",
	);
	await expect(page.getByRole("status")).toContainText("ISBN");
	await capture(page, info, "pdf-isbn-from-text");
});
