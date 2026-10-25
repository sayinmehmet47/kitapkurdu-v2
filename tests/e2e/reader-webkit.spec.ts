import { randomUUID } from "node:crypto";
import { readerEpub } from "../fixtures/book-files";
import { expect, openUploadForm, signUp, test } from "./fixtures";

async function uploadedEpub(page: import("@playwright/test").Page) {
	await signUp(page);
	await openUploadForm(page);
	const name = `WebKit reader ${randomUUID().slice(0, 8)}`;
	await page.getByLabel("Ad", { exact: true }).fill(name);
	await page.locator('input[type="file"]').setInputFiles({
		name: "reader.epub",
		mimeType: "application/epub+zip",
		buffer: Buffer.from(readerEpub()),
	});
	await page.getByRole("button", { name: "Yükle", exact: true }).click();
	await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
	await page.getByRole("link", { name: "Kitabı aç", exact: true }).click();
	return new URL(page.url()).pathname.split("/").at(-1) ?? "";
}

test("an EPUB renders inside the iPhone WebKit reader", async ({ page }) => {
	await uploadedEpub(page);
	await expect(page.getByText("Kitap açılıyor…")).toHaveCount(0, {
		timeout: 20_000,
	});
	await expect(
		page.getByRole("button", { name: "Sonraki sayfa" }),
	).toBeVisible();
	await expect
		.poll(
			() =>
				page.frames().filter((frame) => frame.url().startsWith("blob:")).length,
		)
		.toBeGreaterThan(0);
});

test("an empty EPUB download explains the issue and allows retry", async ({
	page,
}) => {
	await signUp(page);
	await openUploadForm(page);
	const name = `WebKit retry ${randomUUID().slice(0, 8)}`;
	await page.getByLabel("Ad", { exact: true }).fill(name);
	await page.locator('input[type="file"]').setInputFiles({
		name: "retry.epub",
		mimeType: "application/epub+zip",
		buffer: Buffer.from(readerEpub()),
	});
	await page.getByRole("button", { name: "Yükle", exact: true }).click();
	await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
	await page.route("**/api/books/*/download", (route) =>
		route.fulfill({
			status: 200,
			contentType: "application/epub+zip",
			body: "",
		}),
	);
	await page.getByRole("link", { name: "Kitabı aç", exact: true }).click();
	await expect(page.getByRole("alert")).toContainText(
		"EPUB dosyası indirilemedi.",
	);
	await page.unroute("**/api/books/*/download");
	await page.getByRole("button", { name: "Tekrar dene" }).click();
	await expect(page.getByText("Kitap açılıyor…")).toHaveCount(0, {
		timeout: 20_000,
	});
	await expect(
		page.getByRole("button", { name: "Sonraki sayfa" }),
	).toBeVisible();
});
