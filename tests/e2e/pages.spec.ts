import { capture, expect, test } from "./fixtures";

test("home page offers search, recent books, and fits the viewport", async ({
	page,
}, info) => {
	await page.goto("/");
	await expect(
		page.getByRole("heading", { level: 1, name: "Bugün ne okusak?" }),
	).toBeVisible();
	const recent = page.getByRole("region", { name: "Son eklenenler" });
	await expect(recent.getByRole("heading", { name: "Sefiller" })).toBeVisible();
	await expect(recent.getByRole("heading", { name: "1984" })).toBeVisible();
	await expect(
		page.getByRole("region", { name: "Raftan notlar" }),
	).toBeVisible();
	// Home has its own search, so the header does not repeat it.
	await expect(page.getByRole("banner").getByRole("searchbox")).toHaveCount(0);
	await expect
		.poll(() =>
			page.evaluate(
				() => document.documentElement.scrollWidth <= window.innerWidth,
			),
		)
		.toBe(true);
	await capture(page, info, "home");

	const search = page.getByRole("searchbox", { name: "Kitaplıkta ara" });
	await search.fill("Sefiller");
	await search.press("Enter");
	await expect(page).toHaveURL(/\/books\?.*q=Sefiller/);
	await expect(page.getByRole("heading", { name: "Sefiller" })).toBeVisible();
	await expect(page.getByRole("heading", { name: "1984" })).toHaveCount(0);

	await page
		.getByRole("contentinfo")
		.getByRole("link", { name: "Hakkında" })
		.click();
	await expect(
		page.getByRole("heading", { level: 1, name: "KitapKurdu hakkında" }),
	).toBeVisible();
	await capture(page, info, "about");
});

test("site shell is branded, Turkish, themeable, and searchable", async ({
	page,
	isMobile,
}, info) => {
	await page.goto("/");
	await expect(page).toHaveTitle("KitapKurdu");
	await expect(page.locator("html")).toHaveAttribute("lang", "tr");
	const header = page.getByRole("banner");
	await expect(header.getByRole("link", { name: "KitapKurdu" })).toBeVisible();
	await expect(
		page
			.getByRole("navigation", { name: "Ana menü" })
			.getByRole("link", { name: "Kitaplar" }),
	).toBeVisible();
	await expect(
		page
			.getByRole("navigation", { name: "Ana menü" })
			.getByRole("link", { name: "Raf Alanı" }),
	).toBeVisible();

	// Theme cycles system -> light -> dark -> system.
	const toggle = header.getByRole("button", { name: /^Tema:/ });
	await toggle.click();
	await expect(page.locator("html")).toHaveClass(/(^|\s)light(\s|$)/);
	await toggle.click();
	await expect(page.locator("html")).toHaveClass(/(^|\s)dark(\s|$)/);
	await capture(page, info, "home-dark");
	await toggle.click();
	await expect(page.locator("html")).toHaveClass(/(^|\s)light(\s|$)/);

	// Search from a page without its own search field.
	await page.goto("/about");
	if (isMobile) {
		await header.getByRole("link", { name: "Kitaplarda ara" }).click();
		await expect(page.getByRole("heading", { name: "Kitaplar" })).toBeVisible();
		await expect(
			page.getByRole("searchbox", { name: "Kitap ara" }),
		).toBeVisible();
	} else {
		const search = header.getByRole("searchbox", { name: "Kitaplarda ara" });
		await search.fill("1984");
		await search.press("Enter");
		await expect(page).toHaveURL(/\/books\?.*q=%221984%22/);
		await expect(page.getByText("1984", { exact: true })).toBeVisible();
		await expect(page.getByText("Sefiller", { exact: true })).toHaveCount(0);
	}
	// The catalog has its own search field, so the header does not repeat it.
	await expect(
		header.getByRole("searchbox", { name: "Kitaplarda ara" }),
	).toHaveCount(0);
	await capture(page, info, "header-search");
});

test("anonymous users must sign in before viewing private todos", async ({
	page,
}, info) => {
	await page.goto("/demo/drizzle");
	await expect(
		page.getByText("Sign in to create todos saved to your own account."),
	).toBeVisible();
	await expect(page.getByRole("button", { name: "Add Todo" })).toHaveCount(0);
	await capture(page, info, "signed-out-database");
	await page.getByRole("link", { name: "Sign in", exact: true }).last().click();
	await expect(
		page.getByRole("heading", { name: "Sign in", exact: true }),
	).toBeVisible();
	await capture(page, info, "sign-in");
});

test("simple form has labelled controls, validation, and a working submit", async ({
	page,
}, info) => {
	await page.goto("/demo/form/simple");
	await expect(
		page.getByRole("heading", { name: "Simple Form" }),
	).toBeVisible();
	const title = page.getByRole("textbox", { name: "Title", exact: true });
	await title.fill("");
	await title.blur();
	await expect(
		page.getByText("Title is required", { exact: true }),
	).toBeVisible();
	await title.fill("Read a book");
	await page
		.getByRole("textbox", { name: "Description", exact: true })
		.fill("A test of the real form controls.");
	// Complete the form's blur-triggered validation before submitting.
	await page.getByRole("textbox", { name: "Description", exact: true }).blur();
	await expect(
		page.getByText("Title is required", { exact: true }),
	).toHaveCount(0);
	await capture(page, info, "simple-form");
	const dialog = page.waitForEvent("dialog").then(async (confirmation) => {
		expect(confirmation.message()).toBe("Form submitted successfully!");
		await confirmation.accept();
	});
	await page.getByRole("button", { name: "Submit", exact: true }).click();
	await dialog;
});

test("address form renders and exposes its fields accessibly", async ({
	page,
}, info) => {
	await page.goto("/demo/form/address");
	await expect(
		page.getByRole("heading", { name: "Address Form" }),
	).toBeVisible();
	await page
		.getByRole("textbox", { name: "Full Name", exact: true })
		.fill("Test Reader");
	await page
		.getByRole("textbox", { name: "Email", exact: true })
		.fill("reader@example.test");
	await page
		.getByRole("textbox", { name: "Street Address", exact: true })
		.fill("123 Test Street");
	await page.getByRole("combobox", { name: "Country", exact: true }).click();
	await page.getByRole("option", { name: "Germany", exact: true }).click();
	await capture(page, info, "address-form");
});
