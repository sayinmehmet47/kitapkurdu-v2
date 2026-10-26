import { randomUUID } from "node:crypto";
import type { FrameLocator, Page } from "@playwright/test";
import { strToU8 } from "fflate";
import { samplePdf, scannedPdf } from "../fixtures/book-files";
import { capture, expect, openUploadForm, signUp, test } from "./fixtures";

// PDFs open in Mozilla's pdf.js viewer (public/vendor/pdfjs-viewer). These
// tests also run in the iPhone WebKit project (see playwright.config.ts).

async function upload(page: Page, bytes: Uint8Array) {
	await signUp(page);
	await openUploadForm(page);
	const name = `PDF Okuyucu ${randomUUID().slice(0, 8)}`;
	await page.getByLabel("Ad", { exact: true }).fill(name);
	await page.locator('input[type="file"]').setInputFiles({
		name: "kitap.pdf",
		mimeType: "application/pdf",
		buffer: Buffer.from(bytes),
	});
	await page.getByRole("button", { name: "Yükle", exact: true }).click();
	await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
	return new URL(page.url()).pathname.split("/").at(-1) ?? "";
}

const viewerOf = (page: Page) =>
	page.frameLocator('iframe[title$="PDF okuyucu"]');

// Share of dark pixels on a page's canvas: a painted page, not a blank one.
function darkShare(viewer: FrameLocator, pageNumber: number) {
	return viewer
		.locator(`.page[data-page-number="${pageNumber}"] canvas`)
		.first()
		.evaluate((canvas: HTMLCanvasElement) => {
			const pixels = canvas
				.getContext("2d")
				?.getImageData(0, 0, canvas.width, canvas.height).data;
			let dark = 0;
			for (let i = 0; pixels && i < pixels.length; i += 4)
				if (pixels[i] < 100 && pixels[i + 1] < 100 && pixels[i + 2] < 100)
					dark++;
			return dark / (canvas.width * canvas.height);
		});
}

test("PDF uploads open in the pdf.js reader and can be downloaded", async ({
	page,
}, info) => {
	const bytes = samplePdf();
	const id = await upload(page, bytes);
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
	// Reopening a book uses the browser's copy; afterwards it only revalidates.
	expect(response.headers()["cache-control"]).toBe("private, max-age=604800");
	const etag = response.headers().etag;
	expect(etag).toBeTruthy();
	const revalidated = await page.request.get(`/api/books/${id}/download`, {
		headers: { "if-none-match": etag },
	});
	expect(revalidated.status()).toBe(304);
	expect(await revalidated.body()).toHaveLength(0);
	const changed = await page.request.get(`/api/books/${id}/download`, {
		headers: { "if-none-match": '"another-version"' },
	});
	expect(changed.status()).toBe(200);

	await page.getByRole("link", { name: "Kitabı aç", exact: true }).click();
	await expect(page).toHaveURL(new RegExp(`/read/${id}$`));
	const viewer = viewerOf(page);
	await expect(viewer.locator("#numPages")).toContainText("2");
	await expect(viewer.locator("#pageNumber")).toHaveValue("1");
	// Text is selectable and the page is painted.
	await expect(
		viewer.locator('.page[data-page-number="1"] .textLayer'),
	).toContainText("KitapKurdu PDF page 1");
	await expect.poll(() => darkShare(viewer, 1)).toBeGreaterThan(0);
	// Turkish interface, no editing tools or "open file".
	await expect(viewer.locator("#next")).toHaveAttribute(
		"title",
		"Sonraki sayfa",
	);
	await expect(viewer.locator("#editorModeButtons")).toBeHidden();
	await expect(viewer.locator("#secondaryOpenFile")).toBeHidden();
	await capture(page, info, "pdf-reader");

	// Zoom in and out.
	const scale = () =>
		viewer.locator("body").evaluate(
			() =>
				(
					window as unknown as {
						PDFViewerApplication: { pdfViewer: { currentScale: number } };
					}
				).PDFViewerApplication.pdfViewer.currentScale,
		);
	const before = await scale();
	await viewer.locator("#zoomInButton").click();
	await expect.poll(scale).toBeGreaterThan(before);
	const zoomed = await scale();
	await viewer.locator("#zoomOutButton").click();
	await expect.poll(scale).toBeLessThan(zoomed);

	// Go to a page by number (small screens hide the next/previous buttons
	// and scroll instead).
	await viewer.locator("#pageNumber").fill("2");
	await viewer.locator("#pageNumber").press("Enter");
	await expect(viewer.locator("#pageNumber")).toHaveValue("2");
	await expect(
		viewer.locator('.page[data-page-number="2"] .textLayer'),
	).toContainText("KitapKurdu PDF page 2");

	await expect(page.locator("body")).toHaveJSProperty(
		"scrollWidth",
		await page.evaluate(() => window.innerWidth),
	);
	await page.getByRole("link", { name: "Kitaba dön" }).click();
	await expect(page).toHaveURL(new RegExp(`/books/${id}$`));
});

test("scanned PDF pages (CCITT/JBIG2 images) are painted", async ({
	page,
}, info) => {
	await upload(page, scannedPdf());
	await page.getByRole("link", { name: "Kitabı aç", exact: true }).click();
	const viewer = viewerOf(page);
	await expect(viewer.locator("#numPages")).toContainText("1");
	// The image's black frame is drawn, not just a blank white page.
	await expect.poll(() => darkShare(viewer, 1)).toBeGreaterThan(0.1);
	await capture(page, info, "pdf-scanned");
});

test("the reader works in browsers without the newest JavaScript APIs", async ({
	page,
}) => {
	// Older Safari versions (iPhone) lack these; the test browsers have them.
	await page.addInitScript(() => {
		const map = Map.prototype as unknown as Record<string, unknown>;
		const weakMap = WeakMap.prototype as unknown as Record<string, unknown>;
		for (const name of ["getOrInsert", "getOrInsertComputed"]) {
			delete map[name];
			delete weakMap[name];
		}
		delete (RegExp as unknown as Record<string, unknown>).escape;
		delete (Math as unknown as Record<string, unknown>).sumPrecise;
		delete (Promise as unknown as Record<string, unknown>).try;
	});
	await upload(page, samplePdf());
	await page.getByRole("link", { name: "Kitabı aç", exact: true }).click();
	const viewer = viewerOf(page);
	await expect(viewer.locator("#numPages")).toContainText("2");
	await expect(
		viewer.locator('.page[data-page-number="1"] .textLayer'),
	).toContainText("KitapKurdu PDF page 1");
});

test.describe("a damaged PDF", () => {
	// pdf.js reports the broken file on the console; that error is expected
	// here and must occur (see expectedBrowserErrors in fixtures.ts).
	test.use({ expectedBrowserErrors: [/Invalid PDF|InvalidPDFException/] });

	test("shows the reader's error and still offers download", async ({
		page,
	}) => {
		await upload(page, strToU8("%PDF-1.4\n% not a complete document"));
		await page.getByRole("link", { name: "Kitabı aç", exact: true }).click();
		const error = viewerOf(page).locator("#kitapkurdu-error[role=alert]");
		await expect(error).toContainText("Geçersiz veya bozulmuş PDF dosyası.");
		await expect(error).toContainText("Dosyayı indirip");
		await expect(
			page.getByRole("link", { name: "Dosyayı indir" }),
		).toBeVisible();
	});
});
