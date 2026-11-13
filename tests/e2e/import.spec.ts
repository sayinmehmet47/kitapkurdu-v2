import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import {
	DETAILS_HEADER,
	encodeDetails,
	FORMAT_HEADER,
	UPLOAD_PATH,
} from "../../src/lib/upload-request";
import { samplePdf } from "../fixtures/book-files";
import { capture, expect, signInAsAdmin, signUp, test } from "./fixtures";

const pdf = (name: string, pages?: string[]) => ({
	name,
	mimeType: "application/pdf",
	buffer: Buffer.from(samplePdf(pages)),
});

test("bulk import is for admins only", async ({ page }) => {
	await signUp(page);
	await page.goto("/books/new");
	await expect(page.getByRole("link", { name: "Toplu ekle" })).toHaveCount(0);
	await page.goto("/books/import");
	await expect(
		page.getByText("Bu sayfa yalnızca yöneticiler içindir."),
	).toBeVisible();
	await expect(page.locator("#import-files")).toHaveCount(0);
});

test("an admin imports many files at once, with checks before upload", async ({
	page,
}, info) => {
	const id = randomUUID().slice(0, 8);
	await signInAsAdmin(page);
	// A book that is already in the library.
	const listed = await page.request.put(UPLOAD_PATH, {
		headers: {
			[FORMAT_HEADER]: "pdf",
			[DETAILS_HEADER]: encodeDetails({
				name: `Mükerrer ${id}`,
				author: "Deneme Yazarı",
			}),
			"content-type": "application/octet-stream",
		},
		data: Buffer.from(samplePdf()),
	});
	expect(((await listed.json()) as { ok: boolean }).ok).toBe(true);

	await page.goto("/books/new");
	await page.getByRole("link", { name: "Toplu ekle" }).click();
	await expect(
		page.getByRole("heading", { name: "Toplu Kitap Ekle" }),
	).toBeVisible();
	await page.locator('label[data-hydrated="true"]').waitFor();
	await page.locator("#import-files").setInputFiles([
		pdf(`Toplu ${id} -- İlk Yazar.pdf`),
		pdf(`Mükerrer ${id} -- Deneme Yazarı.pdf`),
		pdf("kunye.pdf", ["Birinci sayfa", "ISBN 978-975-07-1938-7"]),
		pdf(`Toplu ${id} -- İlk Yazar (1).pdf`),
		{
			name: "notlar.txt",
			mimeType: "text/plain",
			buffer: Buffer.from("not"),
		},
	]);

	const row = (fileName: string) =>
		page.getByTestId("import-row").filter({ hasText: fileName });
	await expect(page.getByTestId("import-row")).toHaveCount(5);
	await expect(row("notlar.txt")).toContainText("1 KB");
	await expect(page.getByRole("status")).toContainText(
		"kitap yüklenmeye hazır",
	);

	// Read from the file name; no online match, so it asks for a check.
	const first = row(`Toplu ${id} -- İlk Yazar.pdf`);
	await expect(first.getByLabel("Ad", { exact: true })).toHaveValue(
		`Toplu ${id}`,
	);
	await expect(first.getByLabel("Yazar", { exact: true })).toHaveValue(
		"İlk Yazar",
	);
	await expect(first).toContainText("Kontrol et");
	await expect(first.getByRole("checkbox")).toBeChecked();

	// Already listed, and the same file twice: left out unless chosen.
	const listedRow = row(`Mükerrer ${id} -- Deneme Yazarı.pdf`);
	await expect(listedRow).toContainText("Zaten kitaplıkta");
	await expect(listedRow.getByRole("checkbox")).not.toBeChecked();
	const copy = row(`Toplu ${id} -- İlk Yazar (1).pdf`);
	await expect(copy).toContainText("Bu listede iki kez");
	await expect(copy.getByRole("checkbox")).not.toBeChecked();

	// The ISBN printed inside the PDF finds the real title online. Other
	// tests may already have saved this book, so it can also be "listed".
	const isbnRow = row("kunye.pdf");
	await expect(isbnRow.getByLabel("Ad", { exact: true })).toHaveValue(
		"Kürk Mantolu Madonna",
	);
	await expect(isbnRow).toContainText(/Bulundu ✓|Zaten kitaplıkta/);

	const unusable = row("notlar.txt");
	await expect(unusable).toContainText("Yalnızca PDF veya EPUB");
	await expect(unusable.getByRole("checkbox")).toBeDisabled();

	// Corrections are kept, and a row can be removed.
	await first.getByLabel("Ad", { exact: true }).fill(`Toplu ${id} düzeltildi`);
	await page.getByRole("button", { name: "notlar.txt listeden çıkar" }).click();
	await expect(page.getByTestId("import-row")).toHaveCount(4);
	await capture(page, info, "bulk-import-ready");

	await page.getByRole("button", { name: /Seçilenleri yükle/ }).click();
	await expect(first).toContainText("Yüklendi ✓");
	// The edited row, plus the ISBN row unless that book was already listed.
	await expect(page.getByRole("status")).toHaveText(
		/^[12] kitap kitaplığa eklendi\.$/,
	);
	await expect(listedRow).toContainText("Zaten kitaplıkta");
	await capture(page, info, "bulk-import-done");

	await first.getByRole("link", { name: "Kitabı aç" }).click();
	await expect(
		page.getByRole("heading", { name: `Toplu ${id} düzeltildi` }),
	).toBeVisible();
	// The skipped copies were not added.
	await page.goto(`/books?q=${encodeURIComponent(`Mükerrer ${id}`)}`);
	await expect(
		page.getByRole("heading", { name: `Mükerrer ${id}` }),
	).toHaveCount(1);
	await page.goto(`/books?q=${encodeURIComponent(`Toplu ${id}`)}`);
	await expect(page.getByRole("heading", { name: /^Toplu / })).toHaveCount(1);
});
