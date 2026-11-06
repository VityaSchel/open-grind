import { expect, type Page, test } from "@playwright/test";

import { DEV_SERVER_URL } from "../playwright.config";
import { METRES_PER_KILOMETRE } from "../src/lib/util/units";
import {
	afterTwoFrames,
	FIRST_ROUTE_COMPILE_MS,
	installTauriShim,
} from "./support/app";
import { failDemoRequests } from "./support/demo-faults";
import { CHAT_MEDIA_HOST, serveImages } from "./support/media";
import { goToRightNow, RIGHT_NOW_FEED_TIMEOUT } from "./support/right-now";

const POST = '[data-slot="right-now-post"]';
const DISCREET_POST = '[data-slot="right-now-discreet-post"]';
const POST_DISTANCE = '[data-slot="right-now-post-distance"]';
const FEED_SCROLLER = '[data-slot="right-now-scroller"]';
const LIGHTBOX = ".pswp";
const OPEN_PHOTO = "Open photo";
const NOT_OPEN_PHOTO = /^(?!Open photo$)/;
const DEMO_DISCREET_POSTS = 2;
const ORDERED_DISTANCES_CHECKED = 10;
const SCROLLED_TOP = 1200;
const METRES_PER_UNIT: Record<string, number> = {
	m: 1,
	km: METRES_PER_KILOMETRE,
};

const articles = (page: Page) => page.getByRole("article");
const feedScroller = (page: Page) => page.locator(FEED_SCROLLER);

function metres(text: string): number {
	const [amount = "", unit = ""] = text.trim().split(/\s+/);
	return Number(amount) * (METRES_PER_UNIT[unit] ?? Number.NaN);
}

async function nearestFirst(page: Page): Promise<boolean> {
	const texts = await page.locator(POST_DISTANCE).allTextContents();
	const distances = texts.map(metres);
	const ascending = distances.toSorted((a, b) => a - b);
	return (
		distances.length >= ORDERED_DISTANCES_CHECKED &&
		distances.every((distance, index) => distance === ascending[index])
	);
}

function feedScrollTop(page: Page): Promise<number> {
	return feedScroller(page).evaluate((scroller) => scroller.scrollTop);
}

function scrollFeedToBottom(page: Page): Promise<void> {
	return feedScroller(page).evaluate((scroller) => {
		scroller.scrollTop = scroller.scrollHeight;
	});
}

function feedScrollRange(page: Page): Promise<number> {
	return feedScroller(page).evaluate(
		(scroller) => scroller.scrollHeight - scroller.clientHeight,
	);
}

async function openFilter(page: Page, name: string) {
	await page.getByRole("button", { name, exact: true }).click();
	const dialog = page.getByRole("dialog");
	await dialog.waitFor();
	return dialog;
}

async function sortByDistance(page: Page): Promise<void> {
	await page.getByRole("button", { name: "Sort: Newest" }).click();
	await page.getByRole("button", { name: "Sort: Distance" }).waitFor();
}

test.describe("the demo feed", () => {
	test.beforeEach(async ({ page }) => {
		test.setTimeout(240_000);
		await installTauriShim(page);
		await goToRightNow(page);
		await articles(page)
			.first()
			.waitFor({ timeout: RIGHT_NOW_FEED_TIMEOUT });
	});

	test("posts show their headlines, and discreet posts offer no link or button but their photo", async ({
		page,
	}) => {
		await expect(
			page.locator(POST).first().getByRole("heading"),
		).not.toBeEmpty();

		const discreet = page.locator(DISCREET_POST);
		await expect
			.poll(
				async () => {
					await scrollFeedToBottom(page);
					return discreet.count();
				},
				{ timeout: RIGHT_NOW_FEED_TIMEOUT },
			)
			.toBe(DEMO_DISCREET_POSTS);

		for (const card of await discreet.all()) {
			await expect(card.getByRole("heading")).not.toBeEmpty();
			await expect(card.getByRole("button")).toHaveCount(0);
			await expect(
				card.getByRole("link", { name: NOT_OPEN_PHOTO }),
			).toHaveCount(0);
		}
	});

	test("only the feed scrolls, never the page around it", async ({
		page,
	}) => {
		await expect
			.poll(() =>
				page.evaluate(
					() =>
						document.documentElement.scrollHeight -
						document.documentElement.clientHeight,
				),
			)
			.toBe(0);
	});

	test("sorting by Distance lists the closest posts first", async ({
		page,
	}) => {
		expect(await nearestFirst(page)).toBe(false);

		await sortByDistance(page);

		await expect
			.poll(() => nearestFirst(page), { timeout: RIGHT_NOW_FEED_TIMEOUT })
			.toBe(true);
	});

	test("applying a filter shows the new feed from the top", async ({
		page,
	}) => {
		await expect
			.poll(() => feedScrollRange(page), {
				timeout: RIGHT_NOW_FEED_TIMEOUT,
			})
			.toBeGreaterThan(SCROLLED_TOP);
		await feedScroller(page).evaluate(
			(scroller, top) => scroller.scrollTo({ top }),
			SCROLLED_TOP,
		);
		await expect.poll(() => feedScrollTop(page)).toBe(SCROLLED_TOP);

		const shownBefore = await articles(page).first().elementHandle();
		if (shownBefore === null) throw new Error("the feed shows no post");

		await sortByDistance(page);

		await expect
			.poll(() => shownBefore.evaluate((card) => card.isConnected), {
				timeout: RIGHT_NOW_FEED_TIMEOUT,
			})
			.toBe(false);
		await articles(page)
			.first()
			.waitFor({ timeout: RIGHT_NOW_FEED_TIMEOUT });
		await afterTwoFrames(page);
		expect(await feedScrollRange(page)).toBeGreaterThan(SCROLLED_TOP);
		expect(await feedScrollTop(page)).toBe(0);
	});

	test("the Hosting filter leaves only posts that are hosting", async ({
		page,
	}) => {
		const unmarked = articles(page).filter({
			hasNot: page.getByText("Hosting", { exact: true }),
		});
		await expect(unmarked.first()).toBeAttached();

		const dialog = await openFilter(page, "Hosting");
		await dialog.getByRole("switch", { name: "Filter by hosting" }).check();
		await dialog
			.getByRole("radio", { name: "Hosting", exact: true })
			.check();
		await dialog.getByRole("button", { name: "Apply" }).click();

		await expect
			.poll(
				async () => ({
					shown: (await articles(page).count()) > 0,
					unmarked: await unmarked.count(),
				}),
				{ timeout: RIGHT_NOW_FEED_TIMEOUT },
			)
			.toEqual({ shown: true, unmarked: 0 });
	});

	test("an age range nobody posts in shows the empty state, and Reset filters brings posts back", async ({
		page,
	}) => {
		const dialog = await openFilter(page, "Age");
		await dialog.getByRole("slider", { name: "Minimum age" }).press("End");
		await dialog.getByRole("button", { name: "Apply" }).click();

		await expect(page.getByText("No posts found")).toBeVisible({
			timeout: RIGHT_NOW_FEED_TIMEOUT,
		});
		await expect(articles(page)).toHaveCount(0);

		await page.getByRole("button", { name: "Reset filters" }).click();

		await expect(articles(page).first()).toBeVisible({
			timeout: RIGHT_NOW_FEED_TIMEOUT,
		});
		await expect(page.getByText("No posts found")).toHaveCount(0);
	});

	test("returning from a profile keeps the feed's scroll offset", async ({
		page,
	}) => {
		const card = page.locator(POST).nth(5);
		await card.evaluate((node) => node.scrollIntoView({ block: "center" }));
		const offset = await feedScrollTop(page);
		expect(offset).toBeGreaterThan(0);

		await card.getByRole("link").first().click();
		await expect(page).toHaveURL(/\/profile\/\d+$/);

		await page.goBack();
		await expect(page).toHaveURL(/\/right-now$/);
		await expect
			.poll(() => feedScrollTop(page), {
				timeout: RIGHT_NOW_FEED_TIMEOUT,
			})
			.toBe(offset);
	});

	test("a post photo opens in the lightbox, and Escape closes it in place", async ({
		page,
	}) => {
		await serveImages(page, CHAT_MEDIA_HOST);

		await page.getByRole("link", { name: OPEN_PHOTO }).first().click();
		await expect(page.locator(LIGHTBOX)).toBeVisible({ timeout: 30_000 });
		await expect
			.poll(() =>
				page.evaluate(
					() =>
						(window as { pswp?: { opener: { isOpen: boolean } } })
							.pswp?.opener.isOpen,
				),
			)
			.toBe(true);

		await page.keyboard.press("Escape");

		await expect(page.locator(LIGHTBOX)).toBeHidden();
		await expect(page).toHaveURL(/\/right-now$/);
	});
});

test.describe("a feed whose first load fails", () => {
	test.use({ baseURL: DEV_SERVER_URL });

	test("shows the error, and Retry loads the posts", async ({ page }) => {
		test.setTimeout(240_000);
		await installTauriShim(page);
		await failDemoRequests(page, {
			pathPrefix: "/v4/rightnow/feed",
			times: 1,
			status: 503,
		});
		await goToRightNow(page);

		const retry = page.getByRole("button", { name: "Retry" });
		await expect(retry).toBeVisible({ timeout: FIRST_ROUTE_COMPILE_MS });
		expect(await articles(page).count()).toBe(0);

		await retry.click();

		await expect(articles(page).first()).toBeVisible({
			timeout: RIGHT_NOW_FEED_TIMEOUT,
		});
		expect(await retry.count()).toBe(0);
	});
});
