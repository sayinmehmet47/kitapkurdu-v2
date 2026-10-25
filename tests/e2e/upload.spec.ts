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

test("Google Books lookup fills empty fields and the cover before upload", async ({
	page,
}, info) => {
	// The E2E server answers Google Books queries from a local stub.
	await signUp(page);
	await page.goto("/books/new");
	await page.getByLabel("Yazar", { exact: true }).fill("Elle Yazılan Yazar");
	await page.getByLabel("ISBN", { exact: true }).fill("9789750719387");
	await page.getByRole("button", { name: "Bilgileri getir" }).click();

	await expect(page.getByRole("status")).toContainText(
		"Google Books'tan dolduruldu",
	);
	await expect(page.getByLabel("Ad", { exact: true })).toHaveValue(
		"Kürk Mantolu Madonna",
	);
	// Typed values are never overwritten.
	await expect(page.getByLabel("Yazar", { exact: true })).toHaveValue(
		"Elle Yazılan Yazar",
	);
	await expect(page.getByLabel("Yayınevi", { exact: true })).toHaveValue(
		"Yapı Kredi Yayınları",
	);
	await expect(
		page.getByLabel("Kategoriler (virgülle)", { exact: true }),
	).toHaveValue("Fiction");
	await expect(page.locator('[data-slot="book-cover"] img')).toHaveCount(1);
	await capture(page, info, "metadata-filled");

	await page.locator('input[type="file"]').setInputFiles({
		name: "madonna.pdf",
		mimeType: "application/pdf",
		buffer: Buffer.from("%PDF-1.4\n% metadata test\n"),
	});
	await page.getByRole("button", { name: "Yükle" }).click();

	await expect(page).toHaveURL(/\/books\/[0-9a-f-]{36}$/);
	await expect(
		page.getByRole("heading", { level: 1, name: "Kürk Mantolu Madonna" }),
	).toBeVisible();
	await expect(
		page.getByText("Yapı Kredi Yayınları", { exact: true }),
	).toBeVisible();
	await expect(page.locator('[data-slot="book-cover"] img')).toHaveCount(1);
	await capture(page, info, "metadata-book");
});

test("an upload still works when Google Books has no match", async ({
	page,
}) => {
	await signUp(page);
	await page.goto("/books/new");
	await page.getByLabel("Ad", { exact: true }).fill("Hiç Bilinmeyen Kitap");
	await page.getByRole("button", { name: "Bilgileri getir" }).click();
	await expect(page.getByRole("status")).toHaveText(
		"Google Books'ta eşleşen kitap bulunamadı.",
	);
	await page.locator('input[type="file"]').setInputFiles({
		name: "bilinmeyen.pdf",
		mimeType: "application/pdf",
		buffer: Buffer.from("%PDF-1.4\n% no match\n"),
	});
	await page.getByRole("button", { name: "Yükle" }).click();
	await expect(page).toHaveURL(/\/books\/[0-9a-f-]{36}$/);
	await expect(
		page.getByRole("heading", { level: 1, name: "Hiç Bilinmeyen Kitap" }),
	).toBeVisible();
});

test("the form says when Google Books is unavailable", async ({ page }) => {
	await signUp(page);
	await page.goto("/books/new");
	await page.getByLabel("Ad", { exact: true }).fill("Kota Doldu");
	await page.getByRole("button", { name: "Bilgileri getir" }).click();
	await expect(page.getByRole("status")).toHaveText(
		"Google Books şu an yanıt vermiyor; formu elle doldurabilirsin.",
	);
	await expect(page.getByLabel("Yazar", { exact: true })).toHaveValue("");
});
