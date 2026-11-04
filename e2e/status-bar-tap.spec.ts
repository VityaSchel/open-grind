import { expect, type Locator, type Page, test } from "@playwright/test";

import {
	captureInvokes,
	FIRST_ROUTE_COMPILE_MS,
	installTauriShim,
	openGrid,
} from "./support/app";
import {
	backToChats,
	listScroller,
	openConversation,
	openInbox,
	sheet,
} from "./support/chat-stack";
import { CREDITS, openDeepLink } from "./support/page-stack";
import { activeProfilePane, profileLoaded } from "./support/profile-pager";
import { PHONE } from "./support/stack-layers";

test.describe.configure({ timeout: 180_000 });
test.use({ viewport: PHONE });

const GRID = ".pull-scroller";
const SCROLL_TO_TOP = '[aria-label="Scroll to top"]';
const LONG_CONVERSATION = "/chat/100333:123456000";
const SHORT_CONVERSATION = "/chat/100777:123456000";
const FEATURED_PROFILE = "/profile/100001";
const NEWEST_BACKLOG_MESSAGE = "Backlog message 80";
const MESSAGES = '[data-slot="messages-scroller"]';
const MESSAGE = '[data-slot="message"]';
const PROFILE_EDITOR = "/settings/profile";
const SUBPAGE_SCROLLER = '[data-slot="subpage-scroller"]';

const tapStatusBar = (page: Page) =>
	page.evaluate(() => window.__iosStatusBarTap?.());

const scrollTop = (scroller: Locator) =>
	scroller.evaluate((element) => element.scrollTop);

async function scrollDown(
	scroller: Locator,
	{ top, beyond = 16 }: { top?: number; beyond?: number } = {},
): Promise<number> {
	await expect
		.poll(() =>
			scroller.evaluate((element, wanted) => {
				element.scrollTop = wanted ?? element.scrollHeight;
				return element.scrollTop;
			}, top),
		)
		.toBeGreaterThan(beyond);
	return scrollTop(scroller);
}

const centerUncovered = (scroller: Locator) =>
	scroller.evaluate((element) => {
		const box = element.getBoundingClientRect();
		const hit = document.elementFromPoint(
			box.left + box.width / 2,
			box.top + box.height / 2,
		);
		return hit !== null && element.contains(hit);
	});

async function waitForPagingToSettle(page: Page): Promise<number> {
	let previous = -1;
	await expect
		.poll(
			async () => {
				const count = await page.locator(MESSAGE).count();
				const settled = count === previous;
				previous = count;
				return settled;
			},
			{ timeout: 30_000, intervals: [500] },
		)
		.toBe(true);
	return previous;
}

async function backlogLoaded(page: Page): Promise<number> {
	await page
		.getByText(NEWEST_BACKLOG_MESSAGE, { exact: true })
		.filter({ visible: true })
		.waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });
	return waitForPagingToSettle(page);
}

test("a status-bar tap stops the browse grid, glides it to the top and hides its button", async ({
	page,
}) => {
	await installTauriShim(page, { platform: "ios" });
	await openGrid(page);
	const grid = page.locator(GRID);
	const stops = await captureInvokes(page, "stop_scroll_momentum");
	await scrollDown(grid);
	await expect(page.locator(SCROLL_TO_TOP)).toBeVisible();

	await tapStatusBar(page);

	await expect(page.locator(SCROLL_TO_TOP)).toHaveCount(0);
	await expect.poll(() => scrollTop(grid)).toBe(0);
	const box = (await grid.boundingBox())!;
	const sent = (await stops()) as { at: { x: number; y: number } }[];
	expect(sent).toHaveLength(1);
	expect(sent[0]!.at.x).toBeCloseTo(box.x + box.width / 2, 0);
	expect(sent[0]!.at.y).toBeCloseTo(box.y + box.height / 2, 0);
});

test("a status-bar tap glides a settings subpage to the top", async ({
	page,
}) => {
	await openDeepLink(page, CREDITS, { platform: "ios" });
	const scroller = page.locator('[data-slot="subpage-scroller"]');
	await scrollDown(scroller);

	await tapStatusBar(page);

	await expect.poll(() => scrollTop(scroller)).toBe(0);
});

test("a status-bar tap glides the profile page to the top and leaves its photos alone", async ({
	page,
}) => {
	await installTauriShim(page, { platform: "ios" });
	await page.goto(FEATURED_PROFILE);
	await profileLoaded(page);
	const profile = activeProfilePane(page).locator(
		'[data-slot="profile-scroller"]',
	);
	const photos = activeProfilePane(page).locator(".carousel");
	const photoTop = await photos.evaluate((element) => {
		element.scrollTop = element.clientHeight;
		return element.scrollTop;
	});
	await scrollDown(profile);

	await tapStatusBar(page);

	await expect.poll(() => scrollTop(profile)).toBe(0);
	expect(await scrollTop(photos)).toBe(photoTop);
});

test("a status-bar tap in a conversation lands on the oldest loaded message while older history loads above it", async ({
	page,
}) => {
	await installTauriShim(page, { platform: "ios" });
	await page.goto(LONG_CONVERSATION);
	const thread = page.locator(MESSAGES);
	const loaded = await backlogLoaded(page);
	const oldest = await page.locator(MESSAGE).first().elementHandle();
	const offsetInThread = () =>
		oldest!.evaluate((message) => {
			const scroller = message.closest<HTMLElement>(
				'[data-slot="messages-scroller"]',
			)!;
			return {
				fromTop:
					message.getBoundingClientRect().top -
					scroller.getBoundingClientRect().top,
				inContent:
					message.getBoundingClientRect().top -
					scroller.getBoundingClientRect().top +
					scroller.scrollTop,
			};
		});
	const { inContent: topOfThread } = await offsetInThread();

	await tapStatusBar(page);

	await expect
		.poll(() => page.locator(MESSAGE).count(), { timeout: 30_000 })
		.toBeGreaterThan(loaded);
	await waitForPagingToSettle(page);
	const { fromTop } = await offsetInThread();
	expect(Math.abs(fromTop - topOfThread)).toBeLessThanOrEqual(2);
	expect(await scrollTop(thread)).toBeGreaterThan(0);
});

test("a status-bar tap scrolls the conversation opened over the inbox and leaves the inbox be", async ({
	page,
}) => {
	await openInbox(page, { platform: "ios" });
	const inbox = listScroller(page);
	const inboxTop = await scrollDown(inbox, { beyond: 0 });
	await openConversation(page, { href: LONG_CONVERSATION });
	await backlogLoaded(page);
	const thread = page.locator(MESSAGES);
	const threadTop = await scrollTop(thread);
	expect(await scrollTop(inbox)).toBe(inboxTop);

	await tapStatusBar(page);

	await expect.poll(() => scrollTop(thread)).toBeLessThan(threadTop);
	expect(await scrollTop(inbox)).toBe(inboxTop);
});

test("a status-bar tap leaves the inbox be under a conversation resting at its top, and glides it once the conversation closes", async ({
	page,
}) => {
	await openInbox(page, { platform: "ios" });
	const inbox = listScroller(page);
	const inboxTop = await scrollDown(inbox, { beyond: 0 });
	await openConversation(page, { href: SHORT_CONVERSATION });
	const thread = page.locator(MESSAGES);
	await page.locator(MESSAGE).first().waitFor();
	expect(await scrollTop(inbox)).toBe(inboxTop);

	const threadTopAtTap = await thread.evaluate((element) => {
		element.scrollTop = 0;
		const top = element.scrollTop;
		window.__iosStatusBarTap?.();
		return top;
	});
	expect(threadTopAtTap).toBe(0);
	await page.waitForTimeout(600);
	expect(await scrollTop(inbox)).toBe(inboxTop);

	await backToChats(page).click();
	await expect(sheet(page)).toHaveCount(0);
	expect(await scrollTop(inbox)).toBe(inboxTop);
	await tapStatusBar(page);
	await expect.poll(() => scrollTop(inbox)).toBe(0);
});

test("a status-bar tap does nothing while a drawer is open over the grid", async ({
	page,
}) => {
	await installTauriShim(page, { platform: "ios" });
	await openGrid(page);
	const grid = page.locator(GRID);
	const scrolled = await scrollDown(grid, { top: 2000 });
	await page.getByRole("button", { name: "All filters" }).click();
	await expect(page.getByRole("dialog")).toBeVisible();

	await tapStatusBar(page);
	await page.waitForTimeout(600);
	expect(await scrollTop(grid)).toBe(scrolled);

	await page.keyboard.press("Escape");
	await expect(page.getByRole("dialog")).toHaveCount(0);
	await tapStatusBar(page);
	await expect.poll(() => scrollTop(grid)).toBe(0);
});

test("a status-bar tap does nothing while a popup is open, even one that leaves the list in view", async ({
	page,
}) => {
	await openDeepLink(page, PROFILE_EDITOR, { platform: "ios" });
	const scroller = page.locator(SUBPAGE_SCROLLER);
	const tags = page.getByRole("combobox", { name: "Tags", exact: true });
	await tags.waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });
	await tags.evaluate((input) => input.scrollIntoView({ block: "center" }));
	await tags.click();
	const list = page.getByRole("listbox", { name: "Tags" });
	await expect(list).toBeVisible();
	const scrolled = await scrollTop(scroller);
	expect(scrolled).toBeGreaterThan(16);
	expect(await centerUncovered(scroller)).toBe(true);

	await tapStatusBar(page);
	await page.waitForTimeout(600);
	expect(await scrollTop(scroller)).toBe(scrolled);

	await page.keyboard.press("Escape");
	await expect(list).toHaveCount(0);
	await tapStatusBar(page);
	await expect.poll(() => scrollTop(scroller)).toBe(0);
});

test("only iOS listens for status-bar taps", async ({ page }) => {
	await installTauriShim(page, { platform: "android" });
	await openGrid(page);
	await scrollDown(page.locator(GRID));

	expect(
		await page.evaluate(() => window.__iosStatusBarTap === undefined),
	).toBe(true);
});
