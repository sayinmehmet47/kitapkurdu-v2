import { Buffer } from "node:buffer";
import { metadataEpub, samplePdf } from "../fixtures/book-files";
import { capture, expect, openUploadForm, signUp, test } from "./fixtures";

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
	// The E2E config sets UPLOAD_MAX_TOTAL_BYTES to 65536, so this 128 KB PDF is
	// refused before it reaches R2 and no book is created.
	await signUp(page);
	await openUploadForm(page);
	await page.getByLabel("Ad", { exact: true }).fill("Çok Büyük Kitap");
	await page.locator('input[type="file"]').setInputFiles({
		name: "buyuk.pdf",
		mimeType: "application/pdf",
		buffer: Buffer.concat([
			Buffer.from("%PDF-1.4\n"),
			Buffer.alloc(128 * 1024, "a"),
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
	await openUploadForm(page);
	await page.getByLabel("Yazar", { exact: true }).fill("Elle Yazılan Yazar");
	await page.getByLabel("ISBN", { exact: true }).fill("9789750719387");
	await page.getByRole("button", { name: "Bilgileri getir" }).click();

	await expect(page.getByRole("status")).toContainText(
		"Google Books kaynağından dolduruldu",
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

test("a suggested cover can be removed and stays removed on save", async ({
	page,
}) => {
	await signUp(page);
	await openUploadForm(page);
	await page.getByLabel("ISBN", { exact: true }).fill("9789750719387");
	await page.getByRole("button", { name: "Bilgileri getir" }).click();
	await expect(page.locator('[data-slot="book-cover"] img')).toHaveCount(1);

	await page.getByRole("button", { name: "Kapağı kaldır" }).click();
	await expect(page.locator('[data-slot="book-cover"]')).toHaveCount(0);
	// Looking up again does not bring the removed cover back.
	await page.getByRole("button", { name: "Bilgileri getir" }).click();
	await expect(page.getByRole("status")).toContainText("Google Books");
	await expect(page.locator('[data-slot="book-cover"]')).toHaveCount(0);

	await page.locator('input[type="file"]').setInputFiles({
		name: "kapaksiz.pdf",
		mimeType: "application/pdf",
		buffer: Buffer.from("%PDF-1.4\n% no cover\n"),
	});
	await page.getByRole("button", { name: "Yükle" }).click();
	await expect(page).toHaveURL(/\/books\/[0-9a-f-]{36}$/);
	// The detail page shows the generated cover, not the removed image.
	await expect(page.locator('[data-slot="book-cover"]')).toHaveCount(1);
	await expect(page.locator('[data-slot="book-cover"] img')).toHaveCount(0);
});

test("an upload still works when Google Books has no match", async ({
	page,
}) => {
	await signUp(page);
	await openUploadForm(page);
	await page.getByLabel("Ad", { exact: true }).fill("Hiç Bilinmeyen Kitap");
	await page.getByRole("button", { name: "Bilgileri getir" }).click();
	await expect(page.getByRole("status")).toHaveText(
		"Çevrimiçi eşleşen kitap bulunamadı.",
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

test("the form says when no book source is available", async ({ page }) => {
	await signUp(page);
	await openUploadForm(page);
	await page.getByLabel("Ad", { exact: true }).fill("Kota Doldu");
	await page.getByRole("button", { name: "Bilgileri getir" }).click();
	await expect(page.getByRole("status")).toHaveText(
		"Çevrimiçi kitap bilgileri şu an getirilemiyor; formu elle tamamlayabilirsin.",
	);
	await expect(page.getByLabel("Yazar", { exact: true })).toHaveValue("");
});

for (const manual of [false, true]) {
	test(`Open Library descriptions are ${manual ? "preserved when typed" : "filled when blank"} and saved`, async ({
		page,
	}, info) => {
		const description = manual
			? "Benim yazdığım kitap açıklaması."
			: "Open Library üzerinden gelen örnek kitap açıklaması.";
		await signUp(page);
		await openUploadForm(page);
		await page.getByLabel("Ad", { exact: true }).fill("Yedekten Gelen Kitap");
		if (manual)
			await page.getByLabel("Açıklama", { exact: true }).fill(description);
		await page.getByRole("button", { name: "Bilgileri getir" }).click();
		await expect(page.getByRole("status")).toContainText(
			"Open Library kaynağından dolduruldu",
		);
		await expect(page.getByLabel("Yazar", { exact: true })).toHaveValue(
			"Open Library Yazarı",
		);
		await expect(page.locator('[data-slot="book-cover"] img')).toHaveCount(1);
		await expect(page.getByLabel("Açıklama", { exact: true })).toHaveValue(
			description,
		);
		await capture(page, info, "openlibrary-description-form");
		await page.locator('input[type="file"]').setInputFiles({
			name: "openlibrary.pdf",
			mimeType: "application/pdf",
			buffer: Buffer.from("%PDF-1.4\n% Open Library description test\n"),
		});
		await page.getByRole("button", { name: "Yükle", exact: true }).click();
		await expect(page).toHaveURL(/\/books\/[0-9a-f-]{36}$/);
		await expect(page.getByText(description, { exact: true })).toBeVisible();
		await page.reload();
		await expect(page.getByText(description, { exact: true })).toBeVisible();
		await capture(page, info, "openlibrary-description-saved");
	});
}

test("upload still succeeds when Open Library work details are unavailable", async ({
	page,
}) => {
	await signUp(page);
	await openUploadForm(page);
	await page
		.getByLabel("Ad", { exact: true })
		.fill("Açıklaması Alınamayan Kitap");
	// Do not use the preview button: exercise metadata enrichment on save too.
	await page.locator('input[type="file"]').setInputFiles({
		name: "no-description.pdf",
		mimeType: "application/pdf",
		buffer: Buffer.from("%PDF-1.4\n% Optional detail failure\n"),
	});
	await page.getByRole("button", { name: "Yükle", exact: true }).click();
	await expect(page).toHaveURL(/\/books\/[0-9a-f-]{36}$/);
	await expect(
		page.getByRole("heading", {
			level: 1,
			name: "Açıklaması Alınamayan Kitap",
		}),
	).toBeVisible();
	await expect(
		page.getByText("Open Library Yazarı", { exact: true }),
	).toBeVisible();
});

test("choosing an EPUB fills its details and cover from the file itself", async ({
	page,
}, info) => {
	await signUp(page);
	await openUploadForm(page);
	await page.locator('input[type="file"]').setInputFiles({
		name: "madonna.epub",
		mimeType: "application/epub+zip",
		buffer: Buffer.from(metadataEpub()),
	});

	// No button: the file's own details arrive as soon as it is chosen.
	await expect(page.getByRole("status")).toContainText(
		"Dosyadan okundu: ad, yazar, yayınevi, ISBN, açıklama, kategoriler, kapak.",
	);
	await expect(page.getByLabel("Ad", { exact: true })).toHaveValue(
		"Kürk Mantolu Madonna",
	);
	await expect(page.getByLabel("Yazar", { exact: true })).toHaveValue(
		"Sabahattin Ali",
	);
	await expect(page.getByLabel("Yayınevi", { exact: true })).toHaveValue(
		"Yapı Kredi Yayınları",
	);
	await expect(page.getByLabel("ISBN", { exact: true })).toHaveValue(
		"9789750719387",
	);
	await expect(
		page.getByLabel("Kategoriler (virgülle)", { exact: true }),
	).toHaveValue("Roman, Türk Edebiyatı");
	await expect(page.getByLabel("Dil", { exact: true })).toHaveValue("turkish");
	await expect(page.locator('[data-slot="book-cover"] img')).toHaveAttribute(
		"src",
		/^blob:/,
	);
	await capture(page, info, "upload-from-epub");

	await page.getByRole("button", { name: "Yükle", exact: true }).click();
	await expect(page).toHaveURL(/\/books\/[0-9a-f-]{36}$/);
	const id = new URL(page.url()).pathname.split("/").at(-1);
	const cover = page.locator('[data-slot="book-cover"] img');
	await expect(cover).toHaveAttribute("src", `/api/books/${id}/cover`);
	await expect
		.poll(() => cover.evaluate((image: HTMLImageElement) => image.naturalWidth))
		.toBeGreaterThan(0);
	const response = await page.request.get(`/api/books/${id}/cover`);
	expect(response.status()).toBe(200);
	expect(response.headers()["content-type"]).toBe("image/png");
	expect(response.headers()["x-content-type-options"]).toBe("nosniff");
	await capture(page, info, "uploaded-epub-cover");
});

test("choosing a file looks up the remaining details online by itself", async ({
	page,
}) => {
	await signUp(page);
	await openUploadForm(page);
	await page.locator('input[type="file"]').setInputFiles({
		name: "Kürk Mantolu Madonna -- Sabahattin Ali Ali Sabahattin -- ( WeLib.org ).pdf",
		mimeType: "application/pdf",
		buffer: Buffer.from(samplePdf()),
	});

	await expect(page.getByRole("status")).toContainText(
		"Dosyadan okundu: ad, yazar. Google Books kaynağından tamamlandı:",
	);
	await expect(page.getByLabel("Ad", { exact: true })).toHaveValue(
		"Kürk Mantolu Madonna",
	);
	await expect(page.getByLabel("Yazar", { exact: true })).toHaveValue(
		"Sabahattin Ali",
	);
	await expect(page.getByLabel("Yayınevi", { exact: true })).toHaveValue(
		"Yapı Kredi Yayınları",
	);
	await expect(page.locator('[data-slot="book-cover"] img')).toHaveCount(1);
});
