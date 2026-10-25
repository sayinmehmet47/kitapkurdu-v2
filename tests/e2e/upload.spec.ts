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

test("an upload over the storage ceiling is refused with a message", async ({
	page,
}, info) => {
	// The E2E config sets UPLOAD_MAX_TOTAL_BYTES to 4096, so this 8 KB PDF is
	// refused before it reaches R2 and no book is created.
	await signUp(page);
	await page.goto("/books/new");
	await page.getByLabel("Ad", { exact: true }).fill("Çok Büyük Kitap");
	await page.locator('input[type="file"]').setInputFiles({
		name: "buyuk.pdf",
		mimeType: "application/pdf",
		buffer: Buffer.concat([
			Buffer.from("%PDF-1.4\n"),
			Buffer.alloc(8 * 1024, "a"),
		]),
	});
	await page.getByRole("button", { name: "Yükle" }).click();

	await expect(page.getByRole("alert")).toHaveText(
		"Kitaplığın depolama alanı şu an dolu; yeni yükleme kabul edilmiyor.",
	);
	await expect(page).toHaveURL(/\/books\/new$/);
	await capture(page, info, "upload-limit");
	await page.goto("/books?q=%C3%87ok%20B%C3%BCy%C3%BCk%20Kitap");
	await expect(
		page.getByRole("heading", { name: "Çok Büyük Kitap" }),
	).toHaveCount(0);
});
