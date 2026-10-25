import { capture, expect, signUp, test } from "./fixtures";

test("signed-in user can post to the shelf", async ({ page }, info) => {
	await signUp(page);
	await page.goto("/shelf");

	await page.getByLabel("Bir mesaj bırak").fill("Herkese merhaba!");
	await page.getByRole("button", { name: "Gönder" }).click();

	await expect(
		page.locator("li", { hasText: "Herkese merhaba!" }),
	).toBeVisible();
	await expect(
		page.getByText("Browser Test Reader", { exact: true }),
	).toBeVisible();

	await capture(page, info, "shelf-posted");
});

test("anonymous user is prompted to sign in to post", async ({ page }) => {
	await page.goto("/shelf");

	await expect(page.getByRole("link", { name: "giriş yapın" })).toBeVisible();
});
