import { capture, expect, test } from "./fixtures";

test("language and category filters narrow the catalog", async ({
	page,
}, info) => {
	await page.goto("/books");

	await page.getByLabel("Dile göre filtrele").selectOption("english");
	await expect(page.getByText("1984", { exact: true })).toBeVisible();
	await expect(page.getByText("Sefiller", { exact: true })).toHaveCount(0);

	await page.getByLabel("Dile göre filtrele").selectOption("");
	await page.getByLabel("Kategoriye göre filtrele").selectOption("Bilim Kurgu");
	await expect(page.getByText("1984", { exact: true })).toBeVisible();
	await expect(page.getByText("Sefiller", { exact: true })).toHaveCount(0);
	await expect(page.getByText("Suç ve Ceza", { exact: true })).toHaveCount(0);

	await capture(page, info, "books-filtered");
});
