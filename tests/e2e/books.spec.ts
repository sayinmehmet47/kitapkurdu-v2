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
	// Scope by seeded title so books added by other tests cannot change the count.
	for (const name of ["Sefiller", "Suç ve Ceza", "1984"]) {
		const card = page
			.getByRole("article")
			.filter({ has: page.getByRole("heading", { name, exact: true }) });
		await expect(card.locator('[data-slot="book-cover"]')).toHaveCount(1);
		await expect(card.locator('[data-slot="book-cover"] img')).toHaveCount(0);
	}
	await page.emulateMedia({ colorScheme: "dark" });
	await expect(page.locator("html")).toHaveClass(/(^|\s)dark(\s|$)/);
	await capture(page, info, "books-catalog-dark");

	// The title link is stretched over the whole card, so a click in the middle
	// of the cover (where a reader would click) opens the book.
	const cover = page
		.getByRole("article")
		.filter({ has: page.getByRole("heading", { name: "Sefiller" }) })
		.locator('[data-slot="book-cover"]');
	await cover.scrollIntoViewIfNeeded();
	const box = await cover.boundingBox();
	if (!box) throw new Error("Cover is not rendered");
	await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
	await expect(page).toHaveURL(/\/books\/seed-sefiller$/);
	await expect(page.getByRole("heading", { name: "Sefiller" })).toBeVisible();
});

test("a long one-word title fits the generated cover without breaking mid-word", async ({
	page,
}) => {
	// Small covers (home shelf) and catalog covers both have to fit the word.
	for (const path of ["/", "/books"]) {
		await page.goto(path);
		const title = page
			.getByRole("article")
			.filter({
				has: page.getByRole("heading", { name: "Tutunamayanlar", exact: true }),
			})
			.locator('[data-slot="book-cover"] [data-text="Tutunamayanlar"]');
		await expect(title).toHaveCount(1);
		const layout = await title.evaluate((element) => {
			const lineHeight = Number.parseFloat(
				getComputedStyle(element).lineHeight,
			);
			return {
				lines: Math.round(element.getBoundingClientRect().height / lineHeight),
				overflows: element.scrollWidth > element.clientWidth,
			};
		});
		expect(layout, `${path}: title should be one unbroken line`).toEqual({
			lines: 1,
			overflows: false,
		});
	}
});
