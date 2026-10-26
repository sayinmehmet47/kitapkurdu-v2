import { randomBytes, randomUUID } from "node:crypto";
import {
	type BrowserContext,
	test as base,
	expect,
	type Page,
	type TestInfo,
} from "@playwright/test";
import { coverPng } from "../fixtures/book-files";

export async function guardLocalNetwork(context: BrowserContext) {
	await context.route("**/*", async (route) => {
		const url = new URL(route.request().url());
		if (url.origin === "http://127.0.0.1:4173") {
			await route.continue();
		} else if (
			url.hostname === "fonts.googleapis.com" &&
			route.request().resourceType() === "stylesheet"
		) {
			// Deterministic system-font fallback; do not request third-party fonts in tests.
			await route.fulfill({ status: 200, contentType: "text/css", body: "" });
		} else if (
			(url.hostname === "books.google.com" ||
				url.hostname === "covers.openlibrary.org") &&
			route.request().resourceType() === "image"
		) {
			// Covers come from the local API stubs; serve a fixed image instead.
			await route.fulfill({
				status: 200,
				contentType: "image/png",
				body: Buffer.from(coverPng()),
			});
		} else {
			await route.abort("blockedbyclient");
		}
	});
}

export const test = base.extend<{ expectedBrowserErrors: RegExp[] }>({
	// Console errors a test deliberately provokes (e.g. a broken file). Each
	// pattern must match at least once; anything else still fails the test.
	expectedBrowserErrors: [[], { option: true }],
	// Give each isolated browser context its own synthetic client IP for auth rate limiting.
	// The hosted Cloudflare edge overwrites this header; tests only use the local emulator.
	extraHTTPHeaders: async ({ baseURL }, use) => {
		expect(baseURL).toBe("http://127.0.0.1:4173");
		const octets = randomBytes(3);
		await use({
			"cf-connecting-ip": `10.${octets[0]}.${octets[1]}.${octets[2]}`,
		});
	},
	page: async ({ page, expectedBrowserErrors }, use) => {
		const errors: string[] = [];
		page.on("pageerror", (error) => errors.push(error.message));
		page.on("console", (message) => {
			if (message.type() === "error") errors.push(message.text());
		});
		// Block accidental third-party requests, including links to the hosted app.
		await guardLocalNetwork(page.context());
		await use(page);
		for (const pattern of expectedBrowserErrors) {
			expect(
				errors.some((error) => pattern.test(error)),
				`Expected browser error ${pattern}`,
			).toBe(true);
		}
		expect(
			errors.filter(
				(error) =>
					!expectedBrowserErrors.some((pattern) => pattern.test(error)),
			),
			"Unexpected browser JavaScript errors",
		).toEqual([]);
	},
});

export { expect };

export async function capture(page: Page, info: TestInfo, name: string) {
	await page.evaluate(() => document.fonts.ready);
	const path = info.outputPath(`${name}.png`);
	await page.screenshot({ path, fullPage: true, animations: "disabled" });
	await info.attach(name, { path, contentType: "image/png" });
}

// Upload inputs are controlled. Typing before hydration is reset by React, so
// signed-in upload tests wait for the client marker before filling the form.
export async function openUploadForm(page: Page) {
	await page.goto("/books/new");
	await page.locator('form[data-hydrated="true"]').waitFor();
}

export async function signUp(page: Page) {
	const credentials = {
		name: "Browser Test Reader",
		email: `reader-${randomUUID()}@example.test`,
		password: randomBytes(18).toString("base64url"),
	};
	await page.goto("/sign-in");
	const main = page.getByRole("main");
	await main.getByRole("button", { name: "Kayıt ol", exact: true }).click();
	await page.getByLabel("Ad", { exact: true }).fill(credentials.name);
	await page.getByLabel("E-posta", { exact: true }).fill(credentials.email);
	await page.getByLabel("Şifre", { exact: true }).fill(credentials.password);
	await main
		.getByRole("button", { name: "Hesap oluştur", exact: true })
		.click();
	await expect(page.getByRole("heading", { name: "Hoş geldin" })).toBeVisible();
	return credentials;
}
