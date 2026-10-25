import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import { capture, expect, signUp, test } from "./fixtures";

test("regular users do not see admin controls", async ({ page }) => {
	await signUp(page);
	await page.goto("/books/seed-1984");

	await expect(
		page.getByRole("heading", { name: "Değerlendirmeler" }),
	).toBeVisible();
	await expect(page.getByRole("heading", { name: "Yönetici" })).toHaveCount(0);
});

async function uploadAdminBook(page: Page, name: string) {
	await page.goto("/books/new");
	await page.getByLabel("Ad", { exact: true }).fill(name);
	await page.locator('input[type="file"]').setInputFiles({
		name: "admin-test.pdf",
		mimeType: "application/pdf",
		buffer: Buffer.from("%PDF-1.4\n% synthetic admin test\n"),
	});
	await page.getByRole("button", { name: "Yükle", exact: true }).click();
	await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
}

test("admin can edit, hide a duplicate, and delete uploaded books", async ({
	page,
}, info) => {
	const password = process.env.E2E_ADMIN_PASSWORD;
	if (!password) throw new Error("The isolated E2E admin password is missing.");
	await page.goto("/sign-in");
	await page.getByLabel("E-posta", { exact: true }).fill("admin@example.test");
	await page.getByLabel("Şifre", { exact: true }).fill(password);
	await page
		.getByRole("main")
		.getByRole("button", { name: "Giriş yap", exact: true })
		.click();
	await expect(page.getByRole("heading", { name: "Hoş geldin" })).toBeVisible();

	const name = `Yönetici Kitabı ${randomUUID()}`;
	await uploadAdminBook(page, name);
	const bookUrl = page.url();
	const panel = page.getByRole("region", { name: "Yönetici", exact: true });
	await expect(panel).toBeVisible();
	await panel.getByLabel("Ad", { exact: true }).fill(`${name} Düzenlendi`);
	await panel.getByLabel("Yazar", { exact: true }).fill("Yönetici Yazar");
	await panel
		.getByLabel("Açıklama", { exact: true })
		.fill("Yönetici tarafından güncellendi.");
	await panel.getByRole("button", { name: "Kaydet", exact: true }).click();
	await expect(
		page.getByRole("heading", { name: `${name} Düzenlendi`, exact: true }),
	).toBeVisible();
	await page.reload();
	await expect(
		page.getByRole("heading", { name: `${name} Düzenlendi`, exact: true }),
	).toBeVisible();
	await expect(panel.getByLabel("Yazar", { exact: true })).toHaveValue(
		"Yönetici Yazar",
	);
	await expect(
		page.getByRole("link", { name: "Kitabı aç", exact: true }),
	).toBeVisible();
	await expect(page.getByRole("alert")).toHaveCount(0);
	await expect(page.locator("body")).toHaveJSProperty(
		"scrollWidth",
		await page.evaluate(() => window.innerWidth),
	);
	await capture(page, info, "admin-edited");

	await panel
		.getByLabel("Asıl kitabın kimliği", { exact: true })
		.fill("seed-1984");
	await panel
		.getByRole("button", { name: "Kopya olarak işaretle", exact: true })
		.click();
	await expect(
		page.getByRole("heading", { name: "Kitap bulunamadı" }),
	).toBeVisible();
	await page.goto(`/books?q=${encodeURIComponent(name)}`);
	await expect(page.getByRole("article")).toHaveCount(0);
	await page.goto(bookUrl);
	await expect(
		page.getByRole("heading", { name: "Kitap bulunamadı" }),
	).toBeVisible();

	await uploadAdminBook(page, `${name} Silinecek`);
	const deletedUrl = page.url();
	const deletedId = deletedUrl.split("/").at(-1) ?? "";
	expect(
		(await page.request.get(`/api/books/${deletedId}/download`)).status(),
	).toBe(200);
	page.once("dialog", (dialog) => dialog.accept());
	await page.getByRole("button", { name: "Kitabı sil", exact: true }).click();
	await expect(page).toHaveURL(/\/books\/?$/);
	expect(
		(await page.request.get(`/api/books/${deletedId}/download`)).status(),
	).toBe(404);
	await page.goto(deletedUrl);
	await expect(
		page.getByRole("heading", { name: "Kitap bulunamadı" }),
	).toBeVisible();
});
