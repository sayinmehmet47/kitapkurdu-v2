import { capture, expect, test } from "./fixtures";

test("book detail page shows metadata", async ({ page }, info) => {
	await page.goto("/books");
	await page.getByRole("link", { name: "Sefiller" }).click();

	await expect(page.getByRole("heading", { name: "Sefiller" })).toBeVisible();
	await expect(page.getByText("Victor Hugo", { exact: true })).toBeVisible();
	await expect(
		page.getByText("Klasik bir roman.", { exact: true }),
	).toBeVisible();
	await expect(page.getByText("Türkçe", { exact: true })).toBeVisible();
	// Nobody rates Sefiller in the suite, so it has no score yet.
	await expect(page.getByText("Henüz puan yok", { exact: true })).toBeVisible();

	await capture(page, info, "book-detail");
});

test("unknown book shows a not-found state", async ({ page }, info) => {
	await page.goto("/books/does-not-exist");

	await expect(
		page.getByRole("heading", { name: "Kitap bulunamadı" }),
	).toBeVisible();

	await capture(page, info, "book-not-found");
});
