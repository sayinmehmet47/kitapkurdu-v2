import { Buffer } from "node:buffer";
import { capture, expect, signUp, test } from "./fixtures";

test("signed-in user can upload a book PDF and open its detail page", async ({
	page,
}, info) => {
	await signUp(page);
	await page.goto("/books");
	await page.getByRole("link", { name: "Kitap Ekle" }).click();
	await expect(page.getByRole("heading", { name: "Kitap Ekle" })).toBeVisible();

	await page.getByLabel("Ad", { exact: true }).fill("Yüklenen Kitap");
	await page.getByLabel("Yazar", { exact: true }).fill("Test Yazar");
	await page
		.getByLabel("Kategoriler (virgülle)", { exact: true })
		.fill("Roman, Deneme");
	await page.locator('input[type="file"]').setInputFiles({
		name: "yuklenen.pdf",
		mimeType: "application/pdf",
		buffer: Buffer.from("%PDF-1.4\n% test upload\n"),
	});

	await page.getByRole("button", { name: "Yükle" }).click();

	await expect(page).toHaveURL(/\/books\/[0-9a-f-]{36}$/);
	await expect(
		page.getByRole("heading", { name: "Yüklenen Kitap" }),
	).toBeVisible();
	await expect(page.getByRole("link", { name: "Kitabı aç" })).toBeVisible();

	await capture(page, info, "book-uploaded");
});

test("anonymous user is prompted to sign in to upload", async ({ page }) => {
	await page.goto("/books/new");
	await expect(page.getByRole("link", { name: "giriş yapın" })).toBeVisible();
});
