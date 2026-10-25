import { expect, signUp, test } from "./fixtures";

test("regular users do not see admin controls", async ({ page }) => {
	await signUp(page);
	await page.goto("/books/seed-1984");

	await expect(
		page.getByRole("heading", { name: "Değerlendirmeler" }),
	).toBeVisible();
	await expect(page.getByRole("heading", { name: "Yönetici" })).toHaveCount(0);
});
