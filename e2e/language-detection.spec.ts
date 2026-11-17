import { expect, type Page, test } from "@playwright/test";

import { DEV_SERVER_URL } from "../playwright.config";
import { FIRST_ROUTE_COMPILE_MS, installTauriShim } from "./support/app";
import { seedPreferences } from "./support/app-data";

test.use({ baseURL: DEV_SERVER_URL });

test.beforeEach(async ({ page }) => {
	await installTauriShim(page, { platform: "ios" });
});

async function systemLanguages(
	page: Page,
	{ languages }: { languages: string[] },
): Promise<void> {
	await page.addInitScript((list) => {
		Object.defineProperty(Navigator.prototype, "languages", {
			configurable: true,
			get: () => list,
		});
	}, languages);
}

async function expectLanguage(page: Page, tag: string): Promise<void> {
	await expect(page.locator("html")).toHaveAttribute("lang", tag, {
		timeout: FIRST_ROUTE_COMPILE_MS,
	});
}

test.describe("on an iPhone set to German", () => {
	test.use({ locale: "de-DE" });

	test("shows the app in German", async ({ page }) => {
		await page.goto("/");

		await expectLanguage(page, "de-DE");
	});

	test("puts a stored choice first", async ({ page }) => {
		await seedPreferences(page, { preferences: { language: "fr" } });
		await page.goto("/");

		await expectLanguage(page, "fr");
	});

	test("follows the system languages while nothing is chosen", async ({
		page,
	}) => {
		await page.goto("/");
		await expectLanguage(page, "de-DE");

		await page.evaluate(() => {
			Object.defineProperty(Navigator.prototype, "languages", {
				configurable: true,
				get: () => ["fr-CA"],
			});
			window.dispatchEvent(new Event("languagechange"));
		});

		await expectLanguage(page, "fr-CA");
	});
});

test("skips system languages the app doesn't offer", async ({ page }) => {
	await systemLanguages(page, { languages: ["sw-KE", "de-DE"] });
	await page.goto("/");

	await expectLanguage(page, "de-DE");
});
