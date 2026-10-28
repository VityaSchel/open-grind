import { encode } from "@msgpack/msgpack";
import { expect, type Page, test } from "@playwright/test";

import { DEV_SERVER_URL } from "../playwright.config";
import { FIRST_ROUTE_COMPILE_MS } from "./support/app";

test.use({ baseURL: DEV_SERVER_URL });

const PREFERENCES_KEY = "open-grind:app-data:preferences.data";

async function browserLanguages(
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

async function storeLanguage(
	page: Page,
	{ language }: { language: string },
): Promise<void> {
	const content = Buffer.from(encode({ language })).toString("base64");
	await page.addInitScript(
		([key, value]) => {
			if (localStorage.getItem(key) === null) {
				localStorage.setItem(key, value);
			}
		},
		[PREFERENCES_KEY, content] as const,
	);
}

async function expectLanguage(page: Page, tag: string): Promise<void> {
	await expect(page.locator("html")).toHaveAttribute("lang", tag, {
		timeout: FIRST_ROUTE_COMPILE_MS,
	});
}

test.describe("on a browser set to German", () => {
	test.use({ locale: "de-DE" });

	test("shows the app in German", async ({ page }) => {
		await page.goto("/");

		await expectLanguage(page, "de-DE");
	});

	test("puts a stored choice first", async ({ page }) => {
		await storeLanguage(page, { language: "fr" });
		await page.goto("/");

		await expectLanguage(page, "fr");
	});

	test("follows the browser's languages while nothing is chosen", async ({
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

test("skips browser languages the app doesn't offer", async ({ page }) => {
	await browserLanguages(page, { languages: ["sw-KE", "de-DE"] });
	await page.goto("/");

	await expectLanguage(page, "de-DE");
});
