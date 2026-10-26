import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import { strToU8, zipSync } from "fflate";
import { readerEpub, sampleEpub } from "../fixtures/book-files";
import { capture, expect, openUploadForm, signUp, test } from "./fixtures";

async function upload(page: Page, format: "pdf" | "epub", bytes: Uint8Array) {
	await signUp(page);
	await openUploadForm(page);
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

// foliate-js renders each section in a blob: iframe inside closed shadow DOM,
// so read the text from those frames directly.
async function bookText(page: Page) {
	const texts = await Promise.all(
		page
			.frames()
			.filter((frame) => frame.url().startsWith("blob:"))
			.map((frame) =>
				frame.evaluate(() => document.body?.innerText ?? "").catch(() => ""),
			),
	);
	return texts.join("\n");
}

// True once an image from inside the book has actually been painted.
async function bookImageShown(page: Page) {
	const shown = await Promise.all(
		page
			.frames()
			.filter((frame) => frame.url().startsWith("blob:"))
			.map((frame) =>
				frame
					.evaluate(() =>
						[...document.images].some(
							(image) => image.complete && image.naturalWidth > 0,
						),
					)
					.catch(() => false),
			),
	);
	return shown.includes(true);
}

const progressLabel = (page: Page) => page.getByTestId("reader-location");

test("the EPUB reader opens at the text, turns pages, and remembers place and settings", async ({
	page,
}, info) => {
	const id = await upload(page, "epub", readerEpub());
	await page.getByRole("link", { name: "Kitabı aç", exact: true }).click();
	await expect(page).toHaveURL(new RegExp(`/read/${id}$`));

	// Full-screen reader: the site header and footer are hidden.
	await expect(page.getByRole("link", { name: "KitapKurdu" })).toHaveCount(0);
	await expect(page.getByText("Kitap açılıyor…")).toHaveCount(0, {
		timeout: 20_000,
	});
	// The book opens at its beginning: the cover image is shown, not a blank page.
	await expect.poll(() => bookImageShown(page)).toBe(true);
	await capture(page, info, "epub-reader-cover");

	// Next page moves forward into the text.
	const start = await page.getByLabel("Kitapta ilerle").inputValue();
	await page.getByRole("button", { name: "Sonraki sayfa" }).click();
	await expect
		.poll(() => bookText(page))
		.toContain("Okumak, sabırla açılan bir kapı gibidir");
	await expect
		.poll(() => page.getByLabel("Kitapta ilerle").inputValue())
		.not.toBe(start);
	await capture(page, info, "epub-reader");

	// The table of contents jumps to a chapter.
	await page.getByRole("button", { name: "İçindekiler" }).click();
	await page
		.getByRole("dialog", { name: "İçindekiler" })
		.getByRole("button", { name: "İkinci bölüm" })
		.click();
	await expect(progressLabel(page)).toHaveText("İkinci bölüm");
	await expect.poll(() => bookText(page)).toContain("İkinci bölüm 1.");

	// Theme and font size apply to the book and the reader.
	await page.getByRole("button", { name: "Görünüm ayarları" }).click();
	const panel = page.getByRole("dialog", { name: "Görünüm" });
	await panel.getByRole("button", { name: "Koyu" }).click();
	await panel.getByRole("button", { name: "Yazıyı büyüt" }).click();
	await expect(panel.getByText("%110")).toBeVisible();
	// The open dialog hides the page from the accessibility tree; use CSS.
	await expect(page.locator("main")).toHaveCSS(
		"background-color",
		"rgb(26, 21, 18)",
	);
	await expect
		.poll(() =>
			Promise.all(
				page
					.frames()
					.filter((frame) => frame.url().startsWith("blob:"))
					.map((frame) =>
						frame
							.evaluate(
								() => getComputedStyle(document.documentElement).fontSize,
							)
							.catch(() => ""),
					),
			),
		)
		.toContain("17.6px");
	await page.keyboard.press("Escape");
	await capture(page, info, "epub-reader-dark");

	// Reopening keeps the chapter and the settings on this device.
	await page.reload();
	await expect(page.getByText("Kitap açılıyor…")).toHaveCount(0, {
		timeout: 20_000,
	});
	await expect(progressLabel(page)).toHaveText("İkinci bölüm");
	await expect(page.locator("main")).toHaveCSS(
		"background-color",
		"rgb(26, 21, 18)",
	);
	await expect(page.locator("body")).toHaveJSProperty(
		"scrollWidth",
		await page.evaluate(() => window.innerWidth),
	);

	await page.getByRole("link", { name: "Kitaba dön" }).click();
	await expect(page).toHaveURL(new RegExp(`/books/${id}$`));
});

test("the EPUB reader runs no book scripts and loads nothing remote", async ({
	page,
}) => {
	const requests: string[] = [];
	page.on("request", (request) => {
		if (request.url().includes("epub-untrusted.invalid"))
			requests.push(request.url());
	});
	const bytes = sampleEpub({
		"EPUB/one.xhtml": `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "https://epub-untrusted.invalid/book.dtd"><html xmlns="http://www.w3.org/1999/xhtml"><head><title>Birinci bölüm</title><link rel="stylesheet" href="https://epub-untrusted.invalid/style.css"/></head><body onload="parent.parent.postMessage('epub-executed', '*')"><h1>Birinci bölüm</h1><p>Kitaplar yeni dünyalara açılan kapılardır.</p><p>Etiket: &lt;script&gt;yalnızca metin&lt;/script&gt;</p><script>parent.parent.postMessage('epub-executed', '*');</script><img src="https://epub-untrusted.invalid/track" onerror="parent.parent.postMessage('epub-executed', '*')"/><iframe src="https://epub-untrusted.invalid/frame"></iframe><style>@import url(https://epub-untrusted.invalid/import.css); p { background: url(https://epub-untrusted.invalid/bg.png); }</style><a href="javascript:parent.parent.postMessage('epub-executed', '*')">Bağlantı metni</a> <a href="https://epub-untrusted.invalid/out">Dış bağlantı</a></body></html>`,
	});
	const id = await upload(page, "epub", bytes);

	// The reading frame is served with a CSP that only allows this app's scripts.
	const frame = await page.request.get(`/reader/frame?id=${id}`);
	expect(frame.status()).toBe(200);
	const csp = frame.headers()["content-security-policy"] ?? "";
	expect(csp).toContain("script-src 'self'");
	expect(csp).toContain("default-src 'none'");
	expect(csp).toContain("frame-ancestors 'self'");

	await page.goto(`/books/${id}`);
	await page.evaluate(() => {
		Reflect.set(window, "epubScriptRan", false);
		window.addEventListener("message", (event) => {
			if (event.data === "epub-executed")
				Reflect.set(window, "epubScriptRan", true);
		});
	});
	await page.getByRole("link", { name: "Kitabı aç", exact: true }).click();
	await expect
		.poll(() => bookText(page))
		.toContain("Kitaplar yeni dünyalara açılan kapılardır.");
	const text = await bookText(page);
	expect(text).toContain("Etiket: <script>yalnızca metin</script>");
	expect(text).toContain("Bağlantı metni");

	// Clicking links inside the book must not run code or leave the reader.
	for (const frame of page
		.frames()
		.filter((candidate) => candidate.url().startsWith("blob:"))) {
		await frame
			.evaluate(() => {
				for (const link of document.querySelectorAll("a")) link.click();
			})
			.catch(() => undefined);
	}
	await expect(page).toHaveURL(new RegExp(`/read/${id}$`));
	expect(requests).toEqual([]);
	expect(await page.evaluate(() => Reflect.get(window, "epubScriptRan"))).toBe(
		false,
	);
});

test("renaming an ordinary ZIP to EPUB is rejected without a browser error", async ({
	page,
}) => {
	await signUp(page);
	await openUploadForm(page);
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

test("a book without a file has a clear missing-preview state", async ({
	page,
}) => {
	await page.goto("/read/seed-1984");
	await expect(
		page.getByRole("heading", { name: "Kitap açılamadı" }),
	).toBeVisible();
	await expect(
		page.getByRole("link", { name: "Kitap detayına dön" }),
	).toHaveAttribute("href", "/books/seed-1984");
});

test("a slow EPUB download shows how much has arrived", async ({ page }) => {
	const id = await upload(page, "epub", readerEpub());
	// Hold the download so the reader stays in its download phase.
	let release = () => {};
	const held = new Promise<void>((resolve) => {
		release = resolve;
	});
	await page.route(`**/api/books/${id}/download`, async (route) => {
		await held;
		await route.continue();
	});
	await page.getByRole("link", { name: "Kitabı aç", exact: true }).click();
	const loading = page.getByTestId("reader-loading");
	await expect(loading).toHaveText("Kitap açılıyor…");
	await expect
		.poll(() => page.frames().some((f) => f.url().includes("/reader/frame")))
		.toBe(true);
	const frame = page.frames().find((f) => f.url().includes("/reader/frame"));
	// The frame reports bytes as they arrive; the page shows them in MB.
	await frame?.evaluate(() =>
		parent.postMessage(
			{
				type: "progress",
				phase: "download",
				loaded: 1.5 * 1024 ** 2,
				total: 3 * 1024 ** 2,
			},
			location.origin,
		),
	);
	await expect(loading).toHaveText("Kitap indiriliyor… 1,5 / 3,0 MB");

	const finished = page.evaluate(
		() =>
			new Promise<boolean>((resolve) =>
				addEventListener("message", (event) => {
					const data = event.data ?? {};
					if (
						data.type === "progress" &&
						data.phase === "download" &&
						data.total > 0 &&
						data.loaded === data.total
					)
						resolve(true);
				}),
			),
	);
	release();
	expect(await finished).toBe(true);
	await expect(loading).toHaveCount(0, { timeout: 20_000 });
	await expect(
		page.getByRole("button", { name: "Sonraki sayfa" }),
	).toBeVisible();
});

test("a swipe turns the page and pages slide unless motion is reduced", async ({
	page,
}) => {
	const id = await upload(page, "epub", readerEpub());
	const readerFrame = () =>
		page.frames().find((frame) => frame.url().includes("/reader/frame"));
	const animated = () =>
		readerFrame()?.evaluate(
			() =>
				(
					document.querySelector("foliate-view") as unknown as {
						renderer?: Element;
					}
				)?.renderer?.hasAttribute("animated") ?? null,
		);

	// The suite runs with reduced motion: pages change without sliding.
	await page.goto(`/read/${id}`);
	await expect(page.getByText("Kitap açılıyor…")).toHaveCount(0, {
		timeout: 20_000,
	});
	await expect.poll(animated).toBe(false);

	await page.emulateMedia({ reducedMotion: "no-preference" });
	await page.reload();
	await expect(page.getByText("Kitap açılıyor…")).toHaveCount(0, {
		timeout: 20_000,
	});
	await expect.poll(animated).toBe(true);

	// Swipe right-to-left across the page with a real touch sequence.
	const cdp = await page.context().newCDPSession(page);
	await cdp.send("Emulation.setTouchEmulationEnabled", {
		enabled: true,
		maxTouchPoints: 1,
	});
	const box = await page.locator("iframe").boundingBox();
	if (!box) throw new Error("Reader frame is not rendered");
	const y = box.y + box.height / 2;
	const swipe = async () => {
		const from = box.x + box.width * 0.8;
		const to = box.x + box.width * 0.2;
		await cdp.send("Input.dispatchTouchEvent", {
			type: "touchStart",
			touchPoints: [{ x: from, y }],
		});
		for (let step = 1; step <= 8; step++) {
			await cdp.send("Input.dispatchTouchEvent", {
				type: "touchMove",
				touchPoints: [{ x: from + ((to - from) * step) / 8, y }],
			});
		}
		await cdp.send("Input.dispatchTouchEvent", {
			type: "touchEnd",
			touchPoints: [],
		});
	};
	const before = await page.getByLabel("Kitapta ilerle").inputValue();
	await swipe();
	await expect
		.poll(() => page.getByLabel("Kitapta ilerle").inputValue())
		.not.toBe(before);
	await expect
		.poll(() => bookText(page))
		.toContain("Okumak, sabırla açılan bir kapı gibidir");
});
