import { expect, type Locator, type Page, test } from "@playwright/test";

import generated from "../src/lib/credits/generated.json" with { type: "json" };
import { highlights } from "../src/lib/credits/highlights";
import {
	backLink,
	captureOpenedUrls,
	FIRST_ROUTE_COMPILE_MS,
	installTauriShim,
} from "./support/app";

const APP_SETTINGS = "/settings/app";
const CREDITS = `${APP_SETTINGS}/credits`;
const ISSUE_URL = "https://git.opengrind.org/open-grind/open-grind/issues/new";

const featured = new Set(
	highlights.map(({ ref }) => `${ref.ecosystem}:${ref.id}`),
);
const listed = generated.entries.filter(
	(entry) => !featured.has(`${entry.ecosystem}:${entry.id}`),
);
const sharedRows = (ecosystems: string[]) =>
	listed.filter(
		(entry) =>
			entry.platform === undefined &&
			ecosystems.includes(entry.ecosystem),
	).length;
const platformRows = (platform: string) =>
	listed.filter((entry) => entry.platform === platform).length;
const SECTION_ROWS = {
	"Web packages": sharedRows(["npm", "asset"]),
	"Rust crates": sharedRows(["rust"]),
	"Android libraries": platformRows("android"),
	"Linux libraries": platformRows("linux"),
	"macOS libraries": platformRows("macos"),
	"Windows libraries": platformRows("windows"),
};
const HEADINGS = ["Special thanks", ...Object.keys(SECTION_ROWS)];

const rows = (scope: Page | Locator) =>
	scope.locator('[data-slot="credit-row"]');
const section = ({ page, title }: { page: Page; title: string }) =>
	page
		.locator('[data-slot="credit-section"]')
		.filter({
			has: page.getByRole("heading", {
				level: 2,
				name: title,
				exact: true,
			}),
		});
const suggestAnEdit = (page: Page) =>
	page.getByRole("link", { name: "Suggest an edit" });
const scroller = (page: Page) => page.locator('[data-slot="subpage-scroller"]');
const scrollTop = (page: Page) =>
	scroller(page).evaluate((el) => Math.round(el.scrollTop));

async function openCredits(page: Page) {
	await installTauriShim(page);
	await page.goto(CREDITS);
	await rows(page).first().waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });
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

	test("each section lists its own libraries, platform-only ones under their platform", async ({
		page,
	}) => {
		await openCredits(page);
		await suggestAnEdit(page).waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });

		for (const [title, count] of Object.entries(SECTION_ROWS)) {
			expect(count).toBeGreaterThan(0);
			await expect(rows(section({ page, title }))).toHaveCount(count);
		}
	});

	test("a Windows-only crate is listed once, under Windows libraries", async ({
		page,
	}) => {
		await openCredits(page);
		await suggestAnEdit(page).waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });

		const webview2 = (scope: Page | Locator) =>
			rows(scope).filter({
				has: page.getByText("webview2-com", { exact: true }),
			});
		await expect(webview2(page)).toHaveCount(1);
		await expect(
			webview2(section({ page, title: "Windows libraries" })),
		).toHaveCount(1);
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
			await suggestAnEdit(page).waitFor({
				timeout: FIRST_ROUTE_COMPILE_MS,
			});
			expect(await scrollTop(page)).toBe(0);
			await scroller(page).evaluate((el) => el.scrollTo(0, 3000));
			await expect.poll(() => scrollTop(page)).toBe(3000);
		};
		const backOnAppSettings = async () => {
			await expect(page).toHaveURL(new RegExp(`${APP_SETTINGS}$`));
			await expect.poll(() => scrollTop(page)).toBe(appOffset);
		};

		await openCreditsAndScroll();
		const back = backLink(page);
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

		const link = suggestAnEdit(page);
		await link.scrollIntoViewIfNeeded();
		await link.click();

		await expect.poll(opened).toEqual([ISSUE_URL]);
		await expect(page).toHaveURL(new RegExp(`${CREDITS}$`));
	});
});
