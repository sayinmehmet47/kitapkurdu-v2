import { randomUUID } from "node:crypto";
import { scannedPdf } from "../fixtures/book-files";
import { capture, expect, openUploadForm, signUp, test } from "./fixtures";

// Also runs in the iPhone WebKit project (see playwright.config.ts).
test("scanned PDF pages (CCITT/JBIG2 images) are painted", async ({
	page,
}, info) => {
	await signUp(page);
	await openUploadForm(page);
	const name = `Taranmış PDF ${randomUUID().slice(0, 8)}`;
	await page.getByLabel("Ad", { exact: true }).fill(name);
	await page.locator('input[type="file"]').setInputFiles({
		name: "tarama.pdf",
		mimeType: "application/pdf",
		buffer: Buffer.from(scannedPdf()),
	});
	await page.getByRole("button", { name: "Yükle", exact: true }).click();
	await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
	await page.getByRole("link", { name: "Kitabı aç", exact: true }).click();

	await expect(page.getByRole("status")).toHaveText("Sayfa 1 / 1");
	await expect(page.getByText("Sayfa yükleniyor…")).toHaveCount(0);
	await expect(page.getByRole("alert")).toHaveCount(0);
	// The image's black frame is drawn, not just a blank white page.
	await expect
		.poll(() =>
			page.locator("canvas").evaluate((canvas: HTMLCanvasElement) => {
				const pixels = canvas
					.getContext("2d")
					?.getImageData(0, 0, canvas.width, canvas.height).data;
				let dark = 0;
				for (let i = 0; pixels && i < pixels.length; i += 4)
					if (pixels[i] < 60 && pixels[i + 1] < 60 && pixels[i + 2] < 60)
						dark++;
				return dark / (canvas.width * canvas.height);
			}),
		)
		.toBeGreaterThan(0.1);
	await capture(page, info, "pdf-scanned");
});
