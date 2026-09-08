import { expect, type Page, test } from "@playwright/test";

import generated from "../src/lib/credits/generated.json" with { type: "json" };
import { captureOpenedUrls, installTauriShim } from "./support/app";

const APP_SETTINGS = "/settings/app";
const CREDITS = `${APP_SETTINGS}/credits`;
const ISSUE_URL = "https://git.opengrind.org/open-grind/open-grind/issues/new";
const HEADINGS = [
	"Special thanks",
	"Web packages",
	"Rust crates",
	"Android libraries",
];

const rows = (page: Page) => page.locator('[data-slot="credit-row"]');
const scroller = (page: Page) =>
	page.locator('[data-slot="settings-scroller"]');
const scrollTop = (page: Page) =>
	scroller(page).evaluate((el) => Math.round(el.scrollTop));

async function openCredits(page: Page) {
	await installTauriShim(page);
	await page.goto(CREDITS);
	await rows(page).first().waitFor({ timeout: 120_000 });
}

const sidewaysOverflow = (page: Page) =>
	scroller(page).evaluate((el) => ({
		scroller: el.scrollWidth - el.clientWidth,
		document:
			document.documentElement.scrollWidth -
			document.documentElement.clientWidth,
	}));

test.describe("credits page", () => {
	test.describe.configure({ timeout: 120_000 });

	test("no license label or text widens the page at 390px", async ({
		page,
	}) => {
		await page.setViewportSize({ width: 390, height: 800 });
		await openCredits(page);

		await rows(page).locator("summary").first().click();
		await expect(rows(page).locator("pre").first()).toBeVisible();

		expect(await sidewaysOverflow(page)).toEqual({
			scroller: 0,
			document: 0,
		});
	});

	test("every credited project is listed under one flat set of headings", async ({
		page,
	}) => {
		await openCredits(page);

		const main = page.getByRole("main");
		await expect(main.getByRole("heading", { level: 2 })).toHaveText(
			HEADINGS,
		);
		await expect(main.getByRole("heading", { level: 3 })).toHaveCount(0);
		await expect(page.getByRole("searchbox")).toHaveCount(0);
		await expect(
			page.getByRole("button", { name: /^Show all/ }),
		).toHaveCount(0);

		const cards = await page.locator('[data-slot="credit-card"]').count();
		expect(cards).toBeGreaterThan(0);
		await expect(rows(page)).toHaveCount(generated.entries.length - cards);
	});

	test("each settings page keeps its own scroll offset across Back", async ({
		page,
	}) => {
		await installTauriShim(page);
		await page.goto(APP_SETTINGS);
		const link = page.getByRole("link", { name: "Credits & Licenses" });
		await link.scrollIntoViewIfNeeded();
		await scroller(page).evaluate((el) => el.scrollTo(0, el.scrollHeight));
		const appOffset = await scrollTop(page);
		expect(appOffset).toBeGreaterThan(0);

		const openCreditsAndScroll = async () => {
			await link.click();
			await expect(page).toHaveURL(new RegExp(`${CREDITS}$`));
			await rows(page).first().waitFor({ timeout: 120_000 });
			expect(await scrollTop(page)).toBe(0);
			await scroller(page).evaluate((el) => el.scrollTo(0, 3000));
			await expect.poll(() => scrollTop(page)).toBe(3000);
		};
		const backOnAppSettings = async () => {
			await expect(page).toHaveURL(new RegExp(`${APP_SETTINGS}$`));
			await expect.poll(() => scrollTop(page)).toBe(appOffset);
		};

		await openCreditsAndScroll();
		const back = page.getByRole("link", { name: "Back", exact: true });
		await expect(back).toHaveAttribute("href", APP_SETTINGS);
		await back.click();
		await backOnAppSettings();

		await openCreditsAndScroll();
		await page.goBack();
		await backOnAppSettings();
	});

	test("Suggest an edit hands the issue tracker to the system browser", async ({
		page,
	}) => {
		await openCredits(page);
		const opened = await captureOpenedUrls(page);

		const link = page.getByRole("link", { name: "Suggest an edit" });
		await link.scrollIntoViewIfNeeded();
		await link.click();

		await expect.poll(opened).toEqual([ISSUE_URL]);
		await expect(page).toHaveURL(new RegExp(`${CREDITS}$`));
	});
});
