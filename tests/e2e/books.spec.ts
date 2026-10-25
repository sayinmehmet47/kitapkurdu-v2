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

test("books without an image get a generated cover that opens the book", async ({
	page,
}, info) => {
	await page.goto("/books");

	// Seeded books have no cover image, so each card shows a generated cover.
	await expect(page.locator('[data-slot="book-cover"]')).toHaveCount(3);
	await expect(page.locator('[data-slot="book-cover"] img')).toHaveCount(0);
	await page.emulateMedia({ colorScheme: "dark" });
	await expect(page.locator("html")).toHaveClass(/(^|\s)dark(\s|$)/);
	await capture(page, info, "books-catalog-dark");

	// The title link is stretched over the whole card, so a click in the middle
	// of the cover (where a reader would click) opens the book.
	const cover = page
		.getByRole("article")
		.filter({ has: page.getByRole("heading", { name: "Sefiller" }) })
		.locator('[data-slot="book-cover"]');
	const box = await cover.boundingBox();
	if (!box) throw new Error("Cover is not rendered");
	await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
	await expect(page).toHaveURL(/\/books\/seed-sefiller$/);
	await expect(page.getByRole("heading", { name: "Sefiller" })).toBeVisible();
});
