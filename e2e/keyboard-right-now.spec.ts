import { expect, type Locator, type Page, test } from "@playwright/test";

import { installTauriShim } from "./support/app";
import { DRAWER } from "./support/drawer";
import { arrowThrough, focusProblems } from "./support/focus";
import { refreshButton } from "./support/pull";
import {
	goToRightNow,
	RIGHT_NOW_FEED_TIMEOUT,
	scrollFeedToBottom,
} from "./support/right-now";

const FEED_SCROLLER = '[data-slot="right-now-scroller"]';
const DISCREET_POST = '[data-slot="right-now-discreet-post"]';
const DEMO_DISCREET_POSTS = 2;
const PROFILE_LINK = /^View .*profile$/;
const MESSAGE_LINK = /^Message /;
const REPORT_POST = "Report post";
const OPEN_PHOTO = "Open photo";
const WALKED_POSTS = 8;
const POSTS_BEFORE_REOPENED = 2;
const POST_LIFETIME_MS = 60 * 60_000;
const NOW_TICK_MS = 31_000;

type FocusedCell = { post: number; cell: number; name: string };

const feedList = (page: Page) => page.locator(FEED_SCROLLER).getByRole("list");
const feedPosts = (page: Page) => feedList(page).getByRole("listitem");
const feedStop = (page: Page) => feedList(page).locator('[tabindex="0"]');
const postControls = (post: Locator) =>
	post.getByRole("link").or(post.getByRole("button"));

function focusedCell(page: Page): Promise<FocusedCell | null> {
	return feedList(page).evaluate((list) => {
		const focused = document.activeElement;
		const post = focused?.closest("li");
		if (!focused || !post || !list.contains(post)) return null;
		const cells = [...post.querySelectorAll("a[href], button")];
		return {
			post: [...list.children].indexOf(post),
			cell: cells.indexOf(focused),
			name: focused.getAttribute("aria-label") ?? "",
		};
	});
}

async function pressIsPrevented({
	page,
	key,
}: {
	page: Page;
	key: string;
}): Promise<boolean> {
	const outcome = await page.evaluateHandle(() => ({
		prevented: new Promise<boolean>((resolve) => {
			window.addEventListener(
				"keydown",
				(event) => setTimeout(() => resolve(event.defaultPrevented)),
				{ once: true },
			);
		}),
	}));
	await page.keyboard.press(key);
	return outcome.evaluate(({ prevented }) => prevented);
}

async function loadEveryPost(page: Page): Promise<void> {
	await expect
		.poll(
			async () => {
				await scrollFeedToBottom(page);
				return page.locator(DISCREET_POST).count();
			},
			{ timeout: RIGHT_NOW_FEED_TIMEOUT },
		)
		.toBe(DEMO_DISCREET_POSTS);
}

async function focusByKeyboard({
	page,
	cell,
}: {
	page: Page;
	cell: Locator;
}): Promise<void> {
	await cell.focus();
	await page.keyboard.press("Shift+Tab");
	await page.keyboard.press("Tab");
	await expect(cell).toBeFocused();
}

function fullPost(page: Page): Locator {
	return feedPosts(page)
		.filter({ has: page.getByRole("link", { name: OPEN_PHOTO }) })
		.filter({ has: page.getByRole("button", { name: REPORT_POST }) })
		.filter({ has: page.getByRole("link", { name: MESSAGE_LINK }) })
		.first();
}

async function focusMessageLink(page: Page): Promise<number> {
	await focusByKeyboard({
		page,
		cell: fullPost(page).getByRole("link", { name: PROFILE_LINK }),
	});
	const walk = await arrowThrough(page, { key: "ArrowRight", stops: 6 });
	expect(focusProblems(walk)).toEqual([]);
	expect(walk.map(({ element }) => element)).toEqual([
		expect.stringMatching(/^a "View .*profile"$/),
		expect.stringMatching(/^button .*"Report post"$/),
		`a "${OPEN_PHOTO}"`,
		expect.stringMatching(/^a .*"Message /),
	]);
	return (await focusedCell(page))!.post;
}

test.describe("the Right Now feed from the keyboard", () => {
	test.beforeEach(async ({ page }) => {
		test.setTimeout(240_000);
		await installTauriShim(page, { platform: "macos" });
		await goToRightNow(page);
		await feedPosts(page)
			.first()
			.waitFor({ timeout: RIGHT_NOW_FEED_TIMEOUT });
	});

	test("the feed is one Tab stop that rests on the first post's profile link", async ({
		page,
	}) => {
		const stop = feedStop(page);
		await expect(stop).toHaveCount(1);
		await expect(stop).toHaveAccessibleName(PROFILE_LINK);

		await stop.focus();
		expect(await focusedCell(page)).toMatchObject({ post: 0, cell: 0 });
		await page.keyboard.press("Tab");
		expect(await focusedCell(page)).toBeNull();
		await page.keyboard.press("Shift+Tab");
		await expect(stop).toBeFocused();
		await page.keyboard.press("Shift+Tab");
		expect(await focusedCell(page)).toBeNull();
	});

	test("Up and Down move between posts with every focus ring visible", async ({
		page,
	}) => {
		await focusByKeyboard({ page, cell: feedStop(page) });
		const walk = await arrowThrough(page, {
			key: "ArrowDown",
			stops: WALKED_POSTS,
		});
		expect(focusProblems(walk)).toEqual([]);
		expect(walk).toHaveLength(WALKED_POSTS);
		expect(await focusedCell(page)).toMatchObject({
			post: WALKED_POSTS - 1,
			cell: 0,
		});

		const back = await arrowThrough(page, {
			key: "ArrowUp",
			stops: WALKED_POSTS,
		});
		expect(focusProblems(back)).toEqual([]);
		expect(await focusedCell(page)).toMatchObject({ post: 0, cell: 0 });
	});

	test("Left and Right move between a post's controls, and the next post starts on its first control", async ({
		page,
	}) => {
		const row = await focusMessageLink(page);

		await page.keyboard.press("ArrowDown");
		expect(await focusedCell(page)).toMatchObject({
			post: row + 1,
			cell: 0,
		});

		const leftWalk = await arrowThrough(page, {
			key: "ArrowLeft",
			stops: 2,
		});
		expect(leftWalk).toHaveLength(1);
	});

	test("coming back up to a post lands on its first control, not the control Down left from", async ({
		page,
	}) => {
		const row = await focusMessageLink(page);

		await page.keyboard.press("ArrowDown");
		await page.keyboard.press("ArrowUp");

		expect(await focusedCell(page)).toMatchObject({ post: row, cell: 0 });
	});

	test("Up on the first post offers the Refresh button, which Shift+Tab reaches", async ({
		page,
	}) => {
		const stop = feedStop(page);
		await focusByKeyboard({ page, cell: stop });

		expect(await pressIsPrevented({ page, key: "ArrowUp" })).toBe(false);
		await expect(stop).toBeFocused();
		await expect(refreshButton(page)).toBeVisible();

		await page.keyboard.press("Shift+Tab");
		await expect(refreshButton(page)).toBeFocused();
	});

	test("Down past the last rendered post loads more posts and moves into them", async ({
		page,
	}) => {
		const rendered = await feedPosts(page).count();
		await focusByKeyboard({ page, cell: feedStop(page) });

		await page.keyboard.press("End");
		expect(await focusedCell(page)).toMatchObject({
			post: rendered - 1,
			cell: 0,
		});

		await expect
			.poll(
				async () => {
					await page.keyboard.press("ArrowDown");
					return (await focusedCell(page))?.post;
				},
				{ timeout: RIGHT_NOW_FEED_TIMEOUT },
			)
			.toBe(rendered);
		expect(await feedPosts(page).count()).toBeGreaterThan(rendered);
	});

	test("Down on the last post of a fully loaded feed passes on to the feed scroller", async ({
		page,
	}) => {
		await loadEveryPost(page);
		const lastPost = (await feedPosts(page).count()) - 1;
		await focusByKeyboard({ page, cell: feedStop(page) });
		await page.keyboard.press("End");
		const lastCell = await focusedCell(page);
		expect(lastCell).toMatchObject({ post: lastPost, cell: 0 });

		expect(await pressIsPrevented({ page, key: "ArrowDown" })).toBe(false);
		expect(await focusedCell(page)).toEqual(lastCell);
	});

	test("going back from a profile opened with Enter returns focus to that post", async ({
		page,
	}) => {
		await focusByKeyboard({ page, cell: feedStop(page) });
		for (let post = 0; post < POSTS_BEFORE_REOPENED; post++)
			await page.keyboard.press("ArrowDown");
		const opened = await focusedCell(page);
		expect(opened).toMatchObject({ post: POSTS_BEFORE_REOPENED, cell: 0 });

		await page.keyboard.press("Enter");
		await expect(page).toHaveURL(/\/profile\/\d+/);
		await page.goBack();
		await expect(page).toHaveURL(/\/right-now$/);

		await expect(
			feedList(page).getByRole("link", {
				name: opened!.name,
				exact: true,
			}),
		).toBeFocused();
		expect(await focusedCell(page)).toEqual(opened);
	});

	test("blocking a post's author from its report sheet hands focus to the post that takes its place", async ({
		page,
	}) => {
		const post = fullPost(page);
		const profileLink = post.getByRole("link", { name: PROFILE_LINK });
		const profileLinkName = await profileLink.getAttribute("aria-label");
		await focusByKeyboard({ page, cell: profileLink });
		const blocked = (await focusedCell(page))!.post;
		await page.keyboard.press("ArrowRight");
		await expect(
			post.getByRole("button", { name: REPORT_POST }),
		).toBeFocused();
		await page.keyboard.press("Enter");
		const drawer = page.locator(DRAWER);
		await drawer.waitFor({ timeout: 10_000 });
		await drawer
			.getByRole("radio", { name: "Harassment or Bullying" })
			.click();
		await drawer.getByRole("button", { name: "Submit report" }).click();
		await drawer.getByRole("button", { name: "Block user" }).click();
		await expect(page.locator(DRAWER)).toBeHidden();
		await expect(
			feedList(page).getByRole("link", {
				name: profileLinkName!,
				exact: true,
			}),
		).toHaveCount(0, { timeout: RIGHT_NOW_FEED_TIMEOUT });

		const remaining = await feedPosts(page).count();
		await expect
			.poll(() => focusedCell(page))
			.toMatchObject({ post: Math.min(blocked, remaining - 1), cell: 0 });
	});
});

test("a post that expires while focused hands focus to the post that takes its place", async ({
	page,
}) => {
	test.setTimeout(240_000);
	await page.clock.install();
	await installTauriShim(page, { platform: "macos" });
	await goToRightNow(page);
	await feedPosts(page).first().waitFor({ timeout: RIGHT_NOW_FEED_TIMEOUT });

	const { index, expiresAt } = await feedList(page).evaluate(
		(list, lifetime) => {
			const posts = [...list.children].map((post, at) => ({
				at,
				posted: Date.parse(post.querySelector("time")?.dateTime ?? ""),
				focusable: post.querySelector("a[href], button") !== null,
			}));
			const soonest = posts
				.filter(({ focusable, posted }) => focusable && posted > 0)
				.toSorted((a, b) => a.posted - b.posted)[0]!;
			return { index: soonest.at, expiresAt: soonest.posted + lifetime };
		},
		POST_LIFETIME_MS,
	);
	const expiring = feedPosts(page).nth(index);
	await focusByKeyboard({ page, cell: postControls(expiring).first() });
	const expiringHandle = await expiring.elementHandle();

	const untilExpiry = expiresAt - (await page.evaluate(() => Date.now()));
	await page.clock.fastForward(untilExpiry + NOW_TICK_MS);

	await expect
		.poll(() => expiringHandle!.evaluate((post) => post.isConnected))
		.toBe(false);
	const remaining = await feedPosts(page).count();
	await expect
		.poll(() => focusedCell(page))
		.toMatchObject({ post: Math.min(index, remaining - 1), cell: 0 });
});
