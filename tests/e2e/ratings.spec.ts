import { capture, expect, signUp, test } from "./fixtures";

test("signed-in user can rate and review a book", async ({ page }, info) => {
	await signUp(page);
	await page.goto("/books/seed-1984");

	await page.getByLabel("Puanın").selectOption("5");
	await page.getByLabel("Yorum (isteğe bağlı)").fill("Harika bir distopya.");
	await page.getByRole("button", { name: "Gönder" }).click();

	await expect(
		page.locator("li", { hasText: "Harika bir distopya." }),
	).toBeVisible();
	await expect(page.getByRole("button", { name: "Güncelle" })).toBeVisible();

	await capture(page, info, "book-rated");
});

test("anonymous user is prompted to sign in to rate", async ({ page }) => {
	await page.goto("/books/seed-1984");

	await expect(page.getByRole("link", { name: "giriş yapın" })).toBeVisible();
});
