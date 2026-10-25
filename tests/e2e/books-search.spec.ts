import { capture, expect, test } from "./fixtures";

test("book search filters the catalog", async ({ page }, info) => {
	await page.goto("/books");

	const search = page.getByRole("searchbox", { name: "Kitap ara" });
	await search.fill("1984");
	await search.press("Enter");

	await expect(page.getByText("1984", { exact: true })).toBeVisible();
	await expect(page.getByText("Sefiller", { exact: true })).toHaveCount(0);
	await expect(page.getByText("Suç ve Ceza", { exact: true })).toHaveCount(0);

	await capture(page, info, "books-search");
});
