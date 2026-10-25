import { capture, expect, guardLocalNetwork, signUp, test } from "./fixtures";

test("signup, private todos, persistence, signout, and sign-in work together", async ({
	page,
	browser,
}, info) => {
	const credentials = await signUp(page);
	await capture(page, info, "signed-in-account");
	await page.goto("/demo/drizzle");
	await expect(
		page.getByRole("heading", { name: "Drizzle Demo" }),
	).toBeVisible();
	const title = `Read a book in ${info.project.name}`;
	await page.getByPlaceholder("Add a new todo...").fill(title);
	await page.getByRole("button", { name: "Add Todo", exact: true }).click();
	await expect(page.getByText(title, { exact: true })).toBeVisible();
	await page.reload();
	await expect(page.getByText(title, { exact: true })).toBeVisible();
	await capture(page, info, "private-todos");

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
		await otherPage.goto("/demo/drizzle");
		await expect(
			otherPage.getByText("No todos yet. Create one below!", { exact: true }),
		).toBeVisible();
		await expect(otherPage.getByText(title, { exact: true })).toHaveCount(0);
	} finally {
		await otherContext.close();
	}

	await page.getByRole("button", { name: "Sign out", exact: true }).click();
	await expect(
		page.getByText("Sign in to create todos saved to your own account."),
	).toBeVisible();
	await expect(page.getByText(title, { exact: true })).toHaveCount(0);
	await page.goto("/demo/better-auth");
	await page.getByLabel("Email", { exact: true }).fill(credentials.email);
	await page.getByLabel("Password", { exact: true }).fill(credentials.password);
	await page.getByRole("button", { name: "Sign in", exact: true }).click();
	await expect(
		page.getByRole("heading", { name: "Welcome back" }),
	).toBeVisible();
	await page.goto("/demo/drizzle");
	await expect(page.getByText(title, { exact: true })).toBeVisible();
});
