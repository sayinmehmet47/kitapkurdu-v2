import { capture, expect, guardLocalNetwork, signUp, test } from "./fixtures";

const BOOK = "/books/seed-suc-ve-ceza";

test("signup, private rating, persistence, signout, and sign-in work together", async ({
	page,
	browser,
}, info) => {
	const credentials = await signUp(page);
	await capture(page, info, "signed-in-account");

	const review = `Not from ${info.project.name} ${credentials.email}`;
	await page.goto(BOOK);
	await page.getByLabel("Puanın").selectOption("4");
	await page.getByLabel("Yorum (isteğe bağlı)").fill(review);
	await page.getByRole("button", { name: "Gönder", exact: true }).click();
	await expect(page.getByRole("button", { name: "Güncelle" })).toBeVisible();
	await page.reload();
	await expect(page.getByLabel("Yorum (isteğe bağlı)")).toHaveValue(review);

	// A second account sees the public review but not the first account's form state.
	const otherContext = await browser.newContext({
		baseURL: "http://127.0.0.1:4173",
		extraHTTPHeaders: {
			"cf-connecting-ip": `198.51.100.${info.workerIndex + 1}`,
		},
		serviceWorkers: "block",
	});
	try {
		await guardLocalNetwork(otherContext);
		const otherPage = await otherContext.newPage();
		await signUp(otherPage);
		await otherPage.goto(BOOK);
		await expect(otherPage.getByText(review, { exact: true })).toBeVisible();
		await expect(otherPage.getByLabel("Yorum (isteğe bağlı)")).toHaveValue("");
		await expect(
			otherPage.getByRole("button", { name: "Gönder", exact: true }),
		).toBeVisible();
	} finally {
		await otherContext.close();
	}

	await page
		.getByRole("banner")
		.getByRole("button", { name: "Çıkış yap", exact: true })
		.click();
	await page.getByRole("link", { name: "giriş yapın" }).click();
	await expect(page).toHaveURL(/\/sign-in\?redirect=/);
	await page.getByLabel("E-posta", { exact: true }).fill(credentials.email);
	await page.getByLabel("Şifre", { exact: true }).fill(credentials.password);
	await page
		.getByRole("main")
		.getByRole("button", { name: "Giriş yap", exact: true })
		.click();

	// Signing in returns to the book, with this account's rating restored.
	await expect(page).toHaveURL(new RegExp(`${BOOK}$`));
	await expect(page.getByLabel("Yorum (isteğe bağlı)")).toHaveValue(review);
});
