import { capture, expect, test } from "./fixtures";

test("Google sign-in sends the browser to Google with this site's callback", async ({
	page,
}, info) => {
	// Stop at Google: the test never contacts a real Google account.
	let google: URL | undefined;
	await page.route("https://accounts.google.com/**", async (route) => {
		google = new URL(route.request().url());
		await route.fulfill({ status: 200, contentType: "text/html", body: "" });
	});
	await page.goto("/sign-in?redirect=%2Fshelf");
	await capture(page, info, "sign-in-google");
	await page
		.getByRole("button", { name: "Google ile devam et", exact: true })
		.click();
	await expect.poll(() => google?.pathname).toBe("/o/oauth2/v2/auth");
	const params = google?.searchParams;
	expect(params?.get("client_id")).toBe(
		"kitapkurdu-e2e.apps.googleusercontent.com",
	);
	expect(params?.get("redirect_uri")).toBe(
		"http://127.0.0.1:4173/api/auth/callback/google",
	);
	expect(params?.get("scope")?.split(" ")).toEqual(
		expect.arrayContaining(["openid", "email", "profile"]),
	);
	expect(params?.get("prompt")).toBe("select_account");
	expect(params?.get("state")).toBeTruthy();
});

test("a Google account that cannot join a password account is explained", async ({
	page,
}) => {
	await page.goto("/sign-in?error=account_not_linked");
	await expect(page.getByRole("alert")).toHaveText(
		"Bu e-posta adresiyle şifreyle açılmış bir hesap var. E-posta adresin ve şifrenle giriş yap.",
	);
	await page.goto("/sign-in?error=something_else");
	await expect(page.getByRole("alert")).toHaveText(
		"Google ile giriş yapılamadı. Lütfen tekrar deneyin.",
	);
});
