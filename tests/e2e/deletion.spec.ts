import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import { capture, expect, signUp, test } from "./fixtures";

async function uploadBook(page: Page, name: string) {
	await page.goto("/books/new");
	await page.getByLabel("Ad", { exact: true }).fill(name);
	await page.locator('input[type="file"]').setInputFiles({
		name: "silinecek.pdf",
		mimeType: "application/pdf",
		buffer: Buffer.from("%PDF-1.4\n% deletion test\n"),
	});
	await page.getByRole("button", { name: "Yükle", exact: true }).click();
	await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
	return new URL(page.url()).pathname.split("/").at(-1) ?? "";
}

test("an uploader can delete their own book and its file after confirming", async ({
	page,
}, info) => {
	await signUp(page);
	const id = await uploadBook(
		page,
		`Sahibinin Kitabı ${randomUUID().slice(0, 8)}`,
	);
	const before = await page.request.get(`/api/books/${id}/download`);
	expect(before.status()).toBe(200);
	await expect(
		page.getByRole("heading", { name: "Yüklediğin kitap", exact: true }),
	).toBeVisible();
	await expect(
		page.getByRole("heading", { name: "Yönetici", exact: true }),
	).toHaveCount(0);
	await expect(page.locator("body")).toHaveJSProperty(
		"scrollWidth",
		await page.evaluate(() => window.innerWidth),
	);
	await capture(page, info, "owner-delete-controls");

	// Cancelling the browser confirmation keeps the book and file.
	page.once("dialog", (dialog) => dialog.dismiss());
	await page.getByRole("button", { name: "Kitabı sil", exact: true }).click();
	await expect(page).toHaveURL(new RegExp(`/books/${id}$`));
	expect((await page.request.get(`/api/books/${id}/download`)).status()).toBe(
		200,
	);

	page.once("dialog", (dialog) => dialog.accept());
	await page.getByRole("button", { name: "Kitabı sil", exact: true }).click();
	await expect(page).toHaveURL(/\/books\/?$/);
	expect((await page.request.get(`/api/books/${id}/download`)).status()).toBe(
		404,
	);
	await page.goto(`/books/${id}`);
	await expect(
		page.getByRole("heading", { name: "Kitap bulunamadı" }),
	).toBeVisible();
});

test("another signed-in user cannot see or use owner deletion controls", async ({
	page,
}) => {
	await signUp(page);
	const id = await uploadBook(
		page,
		`Başkasının Kitabı ${randomUUID().slice(0, 8)}`,
	);
	await page.getByRole("button", { name: "Çıkış yap" }).click();
	await signUp(page);
	await page.goto(`/books/${id}`);
	await expect(
		page.getByRole("heading", { name: "Değerlendirmeler" }),
	).toBeVisible();
	await expect(page.getByRole("button", { name: "Kitabı sil" })).toHaveCount(0);
	await expect(
		page.getByRole("heading", { name: "Yüklediğin kitap" }),
	).toHaveCount(0);
	await expect(
		page.getByRole("heading", { name: "Yönetici", exact: true }),
	).toHaveCount(0);
});
