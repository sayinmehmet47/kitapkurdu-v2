import { randomBytes } from "node:crypto";
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

test("signing up from a protected action returns to that page", async ({
	page,
}, info) => {
	await page.goto("/shelf");
	await page.getByRole("link", { name: "giriş yapın" }).click();
	await expect(page).toHaveURL(/\/sign-in\?redirect=%2Fshelf$/);
	const main = page.getByRole("main");
	await expect(
		main.getByRole("heading", { level: 1, name: "Giriş yap" }),
	).toBeVisible();
	// The header does not repeat the sign-in entry point on the sign-in page.
	await expect(
		page.getByRole("banner").getByRole("link", { name: "Giriş yap" }),
	).toHaveCount(0);
	await capture(page, info, "sign-in");

	await main.getByRole("button", { name: "Kayıt ol", exact: true }).click();
	await expect(
		main.getByRole("heading", { level: 1, name: "Hesap oluştur" }),
	).toBeVisible();
	await page.getByLabel("Ad", { exact: true }).fill("Raf Okuru");
	await page
		.getByLabel("E-posta", { exact: true })
		.fill(`shelf-${info.project.name}-${Date.now()}@example.test`);
	await page
		.getByLabel("Şifre", { exact: true })
		.fill(randomBytes(18).toString("base64url"));
	await capture(page, info, "sign-up");
	await main
		.getByRole("button", { name: "Hesap oluştur", exact: true })
		.click();

	await expect(page).toHaveURL(/\/shelf$/);
	await expect(page.getByLabel("Bir mesaj bırak")).toBeVisible();
});

test("main pages fit a 360px-wide screen without horizontal scrolling", async ({
	page,
}) => {
	await page.setViewportSize({ width: 360, height: 740 });
	for (const path of [
		"/",
		"/books",
		"/books/seed-suc-ve-ceza",
		"/shelf",
		"/about",
		"/sign-in",
	]) {
		await page.goto(path);
		await expect
			.poll(
				() =>
					page.evaluate(
						() => document.documentElement.scrollWidth <= window.innerWidth,
					),
				{ message: `${path} overflows at 360px` },
			)
			.toBe(true);
	}
});
