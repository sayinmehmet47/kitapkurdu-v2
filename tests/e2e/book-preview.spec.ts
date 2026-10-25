import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import { strToU8, zipSync } from "fflate";
import { sampleEpub, samplePdf } from "../fixtures/book-files";
import { capture, expect, signUp, test } from "./fixtures";

async function upload(page: Page, format: "pdf" | "epub", bytes: Uint8Array) {
	await signUp(page);
	await page.goto("/books/new");
	const name = `${format.toUpperCase()} Önizleme ${randomUUID().slice(0, 8)}`;
	await page.getByLabel("Ad", { exact: true }).fill(name);
	await page.locator('input[type="file"]').setInputFiles({
		name: `ornek.${format}`,
		mimeType: format === "epub" ? "application/epub+zip" : "application/pdf",
		buffer: Buffer.from(bytes),
	});
	await page.getByRole("button", { name: "Yükle", exact: true }).click();
	await expect(
		page.getByRole("heading", { level: 1, name, exact: true }),
	).toBeVisible();
	return new URL(page.url()).pathname.split("/").at(-1) ?? "";
}

test("PDF uploads can be previewed page by page and downloaded", async ({
	page,
}, info) => {
	const bytes = samplePdf();
	const id = await upload(page, "pdf", bytes);
	await expect(
		page.getByRole("definition").filter({ hasText: /^PDF$/ }),
	).toBeVisible();
	const response = await page.request.get(
		`/api/books/${id}/download?download=1`,
	);
	expect(response.status()).toBe(200);
	expect(response.headers()["content-type"]).toBe("application/pdf");
	expect(response.headers()["content-disposition"]).toBe(
		`attachment; filename="${id}.pdf"`,
	);
	expect(await response.body()).toEqual(Buffer.from(bytes));
	await page.getByRole("link", { name: "Kitabı aç", exact: true }).click();
	await expect(page).toHaveURL(new RegExp(`/read/${id}$`));
	await expect(page.getByTestId("pdf-page-text")).toHaveText(
		"KitapKurdu PDF page 1",
	);
	await expect(page.getByRole("status")).toHaveText("Sayfa 1 / 2");
	await expect(
		page.getByRole("button", { name: "Önceki sayfa" }),
	).toBeDisabled();
	await expect(page.locator("canvas")).toBeVisible();
	// A painted page, not just a canvas element or a successful network response.
	expect(
		await page.locator("canvas").evaluate((canvas: HTMLCanvasElement) => {
			const pixels = canvas
				.getContext("2d")
				?.getImageData(0, 0, canvas.width, canvas.height).data;
			return pixels
				? pixels.some((value, i) => i % 4 !== 3 && value < 100)
				: false;
		}),
	).toBe(true);
	await capture(page, info, "pdf-preview");
	await page.getByRole("button", { name: "Sonraki sayfa" }).click();
	await expect(page.getByTestId("pdf-page-text")).toHaveText(
		"KitapKurdu PDF page 2",
	);
	await expect(
		page.getByRole("button", { name: "Sonraki sayfa" }),
	).toBeDisabled();
	await page.getByRole("button", { name: "Önceki sayfa" }).click();
	await expect(page.getByTestId("pdf-page-text")).toHaveText(
		"KitapKurdu PDF page 1",
	);
	await expect(page.locator("body")).toHaveJSProperty(
		"scrollWidth",
		await page.evaluate(() => window.innerWidth),
	);
	await page.getByRole("link", { name: "Kitap detayına dön" }).click();
	await expect(page).toHaveURL(new RegExp(`/books/${id}$`));
});

test("EPUB uploads have safe chapter preview without active or remote content", async ({
	page,
}, info) => {
	const requests: string[] = [];
	page.on("request", (request) => {
		if (request.url().includes("epub-untrusted.invalid"))
			requests.push(request.url());
	});
	const bytes = sampleEpub({
		"EPUB/one.xhtml": `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "https://epub-untrusted.invalid/book.dtd"><html xmlns="http://www.w3.org/1999/xhtml"><head><title>Birinci bölüm</title></head><body><h1>Birinci bölüm</h1><p>Kitaplar yeni dünyalara açılan kapılardır.</p><p>Eski&nbsp;EPUB metni.</p><p>Etiket: &lt;script&gt;yalnızca metin&lt;/script&gt;</p><script>window.parent.postMessage('epub-executed', '*');</script><img src="https://epub-untrusted.invalid/track" onerror="alert(1)"/><iframe src="https://epub-untrusted.invalid/frame"></iframe><style>@import url(https://epub-untrusted.invalid/style);</style><a href="javascript:alert(1)">Bağlantı metni</a></body></html>`,
	});
	const id = await upload(page, "epub", bytes);
	await expect(
		page.getByRole("definition").filter({ hasText: /^EPUB$/ }),
	).toBeVisible();
	const response = await page.request.get(`/api/books/${id}/download`);
	expect(response.status()).toBe(200);
	expect(response.headers()["content-type"]).toBe("application/epub+zip");
	expect(response.headers()["content-disposition"]).toBe(
		`attachment; filename="${id}.epub"`,
	);
	expect(response.headers()["x-content-type-options"]).toBe("nosniff");
	expect(await response.body()).toEqual(Buffer.from(bytes));
	// Any document-provided script must remain unable to send this message.
	await page.evaluate(() => {
		Reflect.set(window, "epubScriptRan", false);
		window.addEventListener("message", (event) => {
			if (event.data === "epub-executed")
				Reflect.set(window, "epubScriptRan", true);
		});
	});
	await page.getByRole("link", { name: "Kitabı aç", exact: true }).click();
	const chapter = page.getByRole("article", { name: "EPUB bölüm içeriği" });
	await expect(
		chapter.getByRole("heading", { name: "Birinci bölüm" }),
	).toBeVisible();
	await expect(
		chapter.getByText("Kitaplar yeni dünyalara açılan kapılardır."),
	).toBeVisible();
	await expect(
		chapter.getByText("Eski EPUB metni.", { exact: true }),
	).toBeVisible();
	await expect(
		chapter.getByText("Etiket: <script>yalnızca metin</script>", {
			exact: true,
		}),
	).toBeVisible();
	await expect(
		chapter.locator(
			"script,img,iframe,object,embed,a,link,[onerror],[src],[href]",
		),
	).toHaveCount(0);
	await expect(page.getByRole("status")).toHaveText("Bölüm 1 / 2");
	await capture(page, info, "epub-preview");
	await page.getByRole("button", { name: "Sonraki bölüm" }).click();
	await expect(
		chapter.getByRole("heading", { name: "İkinci bölüm" }),
	).toBeVisible();
	await expect(page.getByRole("status")).toHaveText("Bölüm 2 / 2");
	await expect(
		page.getByRole("button", { name: "Sonraki bölüm" }),
	).toBeDisabled();
	await page.getByRole("button", { name: "Önceki bölüm" }).click();
	await expect(
		chapter.getByRole("heading", { name: "Birinci bölüm" }),
	).toBeVisible();
	expect(requests).toEqual([]);
	expect(await page.evaluate(() => Reflect.get(window, "epubScriptRan"))).toBe(
		false,
	);
	await expect(page.locator("body")).toHaveJSProperty(
		"scrollWidth",
		await page.evaluate(() => window.innerWidth),
	);
});

test("renaming an ordinary ZIP to EPUB is rejected without a browser error", async ({
	page,
}) => {
	await signUp(page);
	await page.goto("/books/new");
	await page.getByLabel("Ad", { exact: true }).fill("Sahte EPUB");
	await page.locator('input[type="file"]').setInputFiles({
		name: "sahte.epub",
		mimeType: "application/epub+zip",
		buffer: Buffer.from(zipSync({ "not-a-book.txt": strToU8("hello") })),
	});
	await page.getByRole("button", { name: "Yükle", exact: true }).click();
	await expect(page.getByRole("alert")).toHaveText(
		"EPUB dosyası geçersiz, şifreli veya önizleme sınırlarını aşıyor.",
	);
	await expect(page).toHaveURL(/\/books\/new$/);
});

test("a damaged PDF shows a readable preview error and still offers download", async ({
	page,
}) => {
	await upload(page, "pdf", strToU8("%PDF-1.4\n% not a complete document"));
	await page.getByRole("link", { name: "Kitabı aç", exact: true }).click();
	await expect(page.getByRole("alert")).toContainText("Bu PDF önizlenemedi.");
	await expect(page.getByRole("link", { name: "Dosyayı indir" })).toBeVisible();
});

test("a book without a file has a clear missing-preview state", async ({
	page,
}) => {
	await page.goto("/read/seed-1984");
	await expect(
		page.getByRole("heading", { name: "Önizleme bulunamadı" }),
	).toBeVisible();
	await expect(
		page.getByRole("link", { name: "Kitap detayına dön" }),
	).toHaveAttribute("href", "/books/seed-1984");
});
