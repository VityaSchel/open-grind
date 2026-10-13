import { expect, type Page, test } from "@playwright/test";

import { PSEUDO_MESSAGE } from "../src/lib/i18n/fixtures/pseudo-message";
import { backLink, FIRST_ROUTE_COMPILE_MS } from "./support/app";
import { APP_SETTINGS } from "./support/page-stack";

const LANGUAGE_PAGE = `${APP_SETTINGS}/language`;

test.describe.configure({ timeout: 180_000 });

const shownLanguage = (page: Page) =>
	page.locator('[data-slot="language-setting-current"]');

const englishNames = (page: Page) =>
	page
		.locator('[data-slot="language-option"] [data-slot="item-title"]')
		.allTextContents();

const option = (page: Page, name: string) =>
	page.getByRole("radio", { name, exact: true });

const subpageNavigation = (page: Page) =>
	page.locator("nav", { has: page.locator(`a[href="${APP_SETTINGS}"]`) });

async function openLanguagePage(page: Page): Promise<string[]> {
	await page.locator(`a[href="${LANGUAGE_PAGE}"]`).click();
	await expect(page).toHaveURL(new RegExp(`${LANGUAGE_PAGE}$`));
	await option(page, "German Deutsch").waitFor({
		timeout: FIRST_ROUTE_COMPILE_MS,
	});
	return englishNames(page);
}

async function expectShownLanguage(
	page: Page,
	{ name, lang }: { name: string; lang: string },
): Promise<void> {
	await expect(shownLanguage(page)).toHaveText(name);
	await expect(shownLanguage(page)).toHaveAttribute("lang", lang);
}

test("switches to German and back from the Language page", async ({ page }) => {
	await page.goto(APP_SETTINGS);
	await page
		.getByRole("link", { name: "Language English", exact: true })
		.waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });
	await expectShownLanguage(page, { name: "English", lang: "en" });

	const names = await openLanguagePage(page);
	expect(names).toEqual(
		expect.arrayContaining([
			"English (United States)",
			"German",
			"Spanish (Latin America)",
		]),
	);
	await expect(
		option(page, "English (United States) English"),
	).toHaveAttribute("aria-checked", "true");

	await option(page, "German Deutsch").click();

	await expect(page.locator("html")).toHaveAttribute("lang", "de");
	await expect(option(page, "German Deutsch")).toHaveAttribute(
		"aria-checked",
		"true",
	);
	await expect(page).toHaveURL(new RegExp(`${LANGUAGE_PAGE}$`));
	expect(await englishNames(page)).toEqual(names);

	await backLink(page).click();
	await expect(page).toHaveURL(new RegExp(`${APP_SETTINGS}$`));
	await expectShownLanguage(page, { name: "Deutsch", lang: "de" });

	await page.reload();
	await expect(page.locator("html")).toHaveAttribute("lang", "de", {
		timeout: FIRST_ROUTE_COMPILE_MS,
	});
	await expectShownLanguage(page, { name: "Deutsch", lang: "de" });

	expect(await openLanguagePage(page)).toEqual(names);
	await option(page, "English (United States) English").click();

	await expect(page.locator("html")).toHaveAttribute("lang", "en-US");
	expect(await englishNames(page)).toEqual(names);
	await backLink(page).click();
	await expectShownLanguage(page, { name: "English", lang: "en" });
});

test("words the Language page in the chosen language but keeps its English names", async ({
	page,
}) => {
	await page.goto(LANGUAGE_PAGE);
	await subpageNavigation(page)
		.getByText("Language", { exact: true })
		.waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });
	const names = await englishNames(page);

	await option(
		page,
		"English (Pseudo-Accents) English (Pseudo-Accents)",
	).click();

	await expect(page.locator("html")).toHaveAttribute("lang", "en-XA");
	await expect(
		subpageNavigation(page).getByText(PSEUDO_MESSAGE),
	).toBeVisible();
	expect(await englishNames(page)).toEqual(names);
});

test("opens the Language page at the checked language", async ({ page }) => {
	const vietnamese = option(page, "Vietnamese Tiếng Việt");
	await page.goto(`${LANGUAGE_PAGE}?locale=vi`);
	await expect(vietnamese).toHaveAttribute("aria-checked", "true", {
		timeout: FIRST_ROUTE_COMPILE_MS,
	});
	await expect(vietnamese).toBeInViewport({ ratio: 1 });

	await backLink(page).click();
	await expect(page).toHaveURL(new RegExp(`${APP_SETTINGS}$`));
	await page.locator(`a[href="${LANGUAGE_PAGE}"]`).click();

	await expect(page).toHaveURL(new RegExp(`${LANGUAGE_PAGE}$`));
	await expect(vietnamese).toBeInViewport({ ratio: 1 });
});
