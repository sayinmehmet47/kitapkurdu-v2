import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
	testDir: "./tests/e2e",
	fullyParallel: true,
	forbidOnly: Boolean(process.env.CI),
	retries: process.env.CI ? 1 : 0,
	workers: 2,
	timeout: 45_000,
	expect: { timeout: 10_000 },
	outputDir: "test-results",
	reporter: [
		["list"],
		["html", { outputFolder: "playwright-report", open: "never" }],
	],
	use: {
		baseURL: "http://127.0.0.1:4173",
		colorScheme: "light",
		locale: "en-US",
		timezoneId: "UTC",
		reducedMotion: "reduce",
		serviceWorkers: "block",
		screenshot: { mode: "only-on-failure", fullPage: true },
		trace: "retain-on-failure",
		video: "retain-on-failure",
	},
	projects: [
		{ name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } },
		{ name: "mobile-chromium", use: { ...devices["Pixel 7"] } },
	],
	webServer: {
		command: "npm run dev:e2e",
		url: "http://127.0.0.1:4173",
		reuseExistingServer: false,
		timeout: 120_000,
		gracefulShutdown: { signal: "SIGTERM", timeout: 10_000 },
	},
});
