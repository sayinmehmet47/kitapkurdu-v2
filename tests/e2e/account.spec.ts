import { capture, expect, signUp, test } from "./fixtures";

// The wrong password (400) and signing in to the deleted account (401) are
// provoked on purpose; both must occur (see expectedBrowserErrors).
test.use({
	expectedBrowserErrors: {
		patterns: [/status of 400 \(Bad Request\)/, /status of 401/],
	},
});

test("a reader can delete their own account", async ({ page }, info) => {
	const credentials = await signUp(page);
	await page.getByRole("button", { name: "Hesabımı sil", exact: true }).click();
	const section = page.getByRole("region", { name: "Hesabını sil" });
	await expect(section).toContainText("Bu işlem geri alınamaz.");

	await section.getByLabel(/Şifren/).fill("not-the-password");
	await section
		.getByRole("button", { name: "Hesabımı kalıcı olarak sil" })
		.click();
	await expect(section.getByRole("alert")).toHaveText("Şifre hatalı.");
	await capture(page, info, "delete-account");

	await section.getByLabel(/Şifren/).fill(credentials.password);
	await section
		.getByRole("button", { name: "Hesabımı kalıcı olarak sil" })
		.click();
	await expect(page).toHaveURL(/\/$/);

	// The account is gone: the same email and password no longer sign in.
	await page.goto("/sign-in");
	await page.getByLabel("E-posta", { exact: true }).fill(credentials.email);
	await page.getByLabel("Şifre", { exact: true }).fill(credentials.password);
	await page
		.getByRole("main")
		.getByRole("button", { name: "Giriş yap", exact: true })
		.click();
	await expect(page.getByRole("alert")).toHaveText(
		"E-posta ya da şifre hatalı.",
	);
});
