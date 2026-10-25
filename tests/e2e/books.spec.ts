import { capture, expect, test } from "./fixtures";

test("book catalog lists seeded books", async ({ page }, info) => {
	await page.goto("/books");

	await expect(page.getByRole("heading", { name: "Kitaplar" })).toBeVisible();
	await expect(page.getByText("Sefiller", { exact: true })).toBeVisible();
	await expect(page.getByText("Victor Hugo", { exact: true })).toBeVisible();
	await expect(page.getByText("Suç ve Ceza", { exact: true })).toBeVisible();
	await expect(page.getByText("1984", { exact: true })).toBeVisible();

	await capture(page, info, "books-catalog");
});
