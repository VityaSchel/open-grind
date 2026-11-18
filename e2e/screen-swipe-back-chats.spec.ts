import { expect, type Locator, type Page, test } from "@playwright/test";

import {
	DEMO_CONVERSATION,
	emitMessageSent,
	FIRST_ROUTE_COMPILE_MS,
	installTauriShim,
	MESSAGE_ROW,
	watchRendered,
} from "./support/app";
import {
	backToInbox,
	openConversation,
	openInbox,
	sheet,
} from "./support/chat-stack";
import {
	OUTSIDE_SCREEN_GHOSTS,
	SCREEN_DIM,
	SCREEN_HOST,
	screenGhost,
	screenSettled,
} from "./support/page-stack";
import {
	activeProfilePane,
	openBrowse,
	openTile,
	PROFILE_PAGER,
	profileUrl,
} from "./support/profile-pager";
import { goToRightNow, RIGHT_NOW_FEED_TIMEOUT } from "./support/right-now";
import { LIVE_STACK, PHONE } from "./support/stack-layers";
import {
	commitSystemBack,
	edgeSwipeZone,
	expectEdgeSwipeArmed,
	progressEdgeSwipe,
	progressSystemBack,
	releaseEdgeSwipe,
	startEdgeSwipe,
	startSystemBack,
} from "./support/system-back";

test.describe.configure({ timeout: 180_000 });
test.use({ viewport: PHONE });

const NAV_BAR = '[data-slot="navbar"]';
const NAV_BAR_COPY = '[data-slot="screen-ghost-navbar"]';
const RIGHT_NOW = /\/right-now$/;
const RIGHT_NOW_POST = '[data-slot="right-now-post"]';
const CONVERSATION = /\/chat\/[^/]+$/;
const POPUP = '.incoming-message-toast [role="button"]';
const POPUP_PEER = 100002;
const POPUP_CONVERSATION = `/chat/${POPUP_PEER}:123456000`;
const IN_DEMO_CONVERSATION = "consectetur adipiscing elit";

const liveProfilePager = (page: Page) =>
	page.locator(`${PROFILE_PAGER}${OUTSIDE_SCREEN_GHOSTS}`);
const liveNavBar = (page: Page) =>
	page.locator(`${NAV_BAR}${OUTSIDE_SCREEN_GHOSTS}`);
const liveInbox = (page: Page) =>
	page.locator(`${LIVE_STACK.base}${OUTSIDE_SCREEN_GHOSTS}`);
const leftEdge = (locator: Locator) =>
	locator.evaluate((element) => element.getBoundingClientRect().x);
const writeMessage = (page: Page) =>
	activeProfilePane(page).getByRole("link", { name: "Write a message…" });

async function conversationOpened(page: Page) {
	await expect(page).toHaveURL(CONVERSATION, {
		timeout: FIRST_ROUTE_COMPILE_MS,
	});
	await backToInbox(page).waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });
	await sheet(page).getByRole("textbox").first().waitFor();
}

async function openChatFromBrowseProfile(
	page: Page,
	{ platform }: { platform: "ios" | "android" },
) {
	const tiles = await openBrowse(page, { platform });
	await openTile(page, { tiles, nth: 0 });
	const slid = await watchRendered(page, { selector: SCREEN_DIM });
	await writeMessage(page).click();
	await conversationOpened(page);
	expect(await slid(), "a screen slid on the tap").toBe(false);
	return { tiles };
}

async function expectPicturedWithNavBar(
	page: Page,
	{ showing }: { showing: string },
) {
	await expect(screenGhost(page)).toBeVisible();
	await expect(screenGhost(page).locator(showing).first()).toBeVisible();
	await expect(screenGhost(page).locator(NAV_BAR_COPY)).toBeVisible();
	await expect(
		liveInbox(page),
		"the inbox under the chat stays out of the picture",
	).toBeHidden();
}

async function expectLandedWithLiveNavBar(page: Page) {
	await screenSettled(page);
	await expect(page.locator(NAV_BAR_COPY)).toHaveCount(0);
	await expect(liveNavBar(page)).toBeVisible();
	expect(await leftEdge(liveNavBar(page))).toBe(0);
}

test.describe("the iOS edge swipe in a chat opened outside the inbox", () => {
	test("follows the finger from a chat opened from a profile over a picture of the profile with its tab bar, and lands on it with the live tab bar", async ({
		page,
	}) => {
		const { tiles } = await openChatFromBrowseProfile(page, {
			platform: "ios",
		});
		await expectEdgeSwipeArmed(page, { armed: true });
		expect(await edgeSwipeZone(page)).toBe("goes-back");
		await expect(
			screenGhost(page),
			"the picture waits unseen",
		).toBeHidden();
		const atRest = await leftEdge(sheet(page));

		expect(await startEdgeSwipe(page)).toBe(true);
		await progressEdgeSwipe(page, 0.5);
		await expectPicturedWithNavBar(page, { showing: PROFILE_PAGER });
		expect(
			await leftEdge(sheet(page)),
			"the conversation follows the finger",
		).toBeCloseTo(atRest + PHONE.width / 2, 0);
		await expect(page.locator(LIVE_STACK.dim)).toHaveCount(0);

		await releaseEdgeSwipe(page, { commit: true, velocity: 1 });
		await expect(page).toHaveURL(profileUrl(tiles[0]!));
		await expectLandedWithLiveNavBar(page);
		await expect(liveProfilePager(page)).toBeVisible();
		await expectEdgeSwipeArmed(page, { armed: true });
	});

	test("slides a chat opened from a profile back in when the swipe is let go short", async ({
		page,
	}) => {
		await openChatFromBrowseProfile(page, { platform: "ios" });
		await expectEdgeSwipeArmed(page, { armed: true });
		const atRest = await leftEdge(sheet(page));
		const chat = page.url();

		expect(await startEdgeSwipe(page)).toBe(true);
		await progressEdgeSwipe(page, 0.3);
		await releaseEdgeSwipe(page, { commit: false, velocity: -0.5 });

		await screenSettled(page);
		expect(await leftEdge(sheet(page))).toBe(atRest);
		await expect(page).toHaveURL(chat);
		await expect(screenGhost(page)).toBeHidden();
		await expectEdgeSwipeArmed(page, { armed: true });
	});

	test("goes back from a chat opened from a Right Now card over a picture of Right Now", async ({
		page,
	}) => {
		await installTauriShim(page, { platform: "ios" });
		await goToRightNow(page);
		const message = page
			.locator(`${RIGHT_NOW_POST} a[href^="/chat/"]`)
			.first();
		await message.waitFor({ timeout: RIGHT_NOW_FEED_TIMEOUT });
		await message.click();
		await conversationOpened(page);
		await expectEdgeSwipeArmed(page, { armed: true });

		expect(await startEdgeSwipe(page)).toBe(true);
		await progressEdgeSwipe(page, 0.5);
		await expectPicturedWithNavBar(page, { showing: RIGHT_NOW_POST });

		await releaseEdgeSwipe(page, { commit: true, velocity: 1 });
		await expect(page).toHaveURL(RIGHT_NOW);
		await expectLandedWithLiveNavBar(page);
		await expect(screenGhost(page)).toHaveCount(0);
		await expect(page.locator(RIGHT_NOW_POST).first()).toBeVisible();
	});

	test("goes back from a chat opened from the message popup over a picture of the chat it was opened over", async ({
		page,
	}) => {
		await openInbox(page, { platform: "ios", injectEvents: true });
		await openConversation(page, { href: DEMO_CONVERSATION });
		await expect(sheet(page)).toContainText(IN_DEMO_CONVERSATION);
		expect(await edgeSwipeZone(page)).toBe("shared");
		const timestamp = Date.now() + 60_000;
		await emitMessageSent(page, {
			type: "Text",
			body: { text: "popped up" },
			messageId: `ws-text-${timestamp}`,
			conversationId: `${POPUP_PEER}:123456000`,
			senderId: POPUP_PEER,
			timestamp,
			unsent: false,
			reactions: [],
			replyToMessage: null,
		});
		const slid = await watchRendered(page, { selector: SCREEN_DIM });
		await page.locator(POPUP).click();
		await expect(page).toHaveURL(new RegExp(`${POPUP_CONVERSATION}$`));
		await expect(sheet(page).locator(MESSAGE_ROW)).not.toHaveCount(0);
		await expect(sheet(page)).not.toContainText(IN_DEMO_CONVERSATION);
		expect(await slid(), "a screen slid on the tap").toBe(false);
		await expectEdgeSwipeArmed(page, { armed: true });
		expect(
			await edgeSwipeZone(page),
			"the screen stack owns the swipe, not the inbox's",
		).toBe("goes-back");

		expect(await startEdgeSwipe(page)).toBe(true);
		await progressEdgeSwipe(page, 0.5);
		await expect(screenGhost(page)).toBeVisible();
		await expect(
			screenGhost(page).locator(MESSAGE_ROW).first(),
		).toBeVisible();
		await expect(screenGhost(page)).toContainText(IN_DEMO_CONVERSATION);
		await expect(page.locator(LIVE_STACK.dim)).toHaveCount(0);
		await expect(
			liveInbox(page),
			"the inbox under the chat stays out of the picture",
		).toBeHidden();

		await releaseEdgeSwipe(page, { commit: true, velocity: 1 });
		await expect(page).toHaveURL(new RegExp(`${DEMO_CONVERSATION}$`));
		await screenSettled(page);
		await expect(screenGhost(page)).toHaveCount(0);
		await expect(sheet(page)).toContainText(IN_DEMO_CONVERSATION);
		await expectEdgeSwipeArmed(page, { armed: true });
		expect(await edgeSwipeZone(page), "the inbox's own swipe is back").toBe(
			"shared",
		);
	});

	test("a conversation opened from the inbox keeps the inbox's own swipe, with no screen picture", async ({
		page,
	}) => {
		await openInbox(page, { platform: "ios" });
		await openConversation(page, { href: DEMO_CONVERSATION });
		await expectEdgeSwipeArmed(page, { armed: true });
		expect(await edgeSwipeZone(page)).toBe("shared");
		await expect(page.locator(SCREEN_HOST)).toHaveCount(0);

		expect(await startEdgeSwipe(page)).toBe(true);
		await progressEdgeSwipe(page, 0.5);
		await expect(page.locator(LIVE_STACK.dim)).toHaveCount(1);
		await expect(page.locator(SCREEN_HOST)).toHaveCount(0);

		await releaseEdgeSwipe(page, { commit: true, velocity: 1 });
		await expect(page).toHaveURL(/\/chat$/);
		await expect(sheet(page)).toHaveCount(0);
	});
});

test("Android's predictive back from a chat opened from a profile follows the gesture over a picture of the profile with its tab bar and lands on it", async ({
	page,
}) => {
	const { tiles } = await openChatFromBrowseProfile(page, {
		platform: "android",
	});
	const atRest = await leftEdge(sheet(page));

	expect(await startSystemBack(page)).toBe(true);
	await progressSystemBack(page, 0.5);
	await expectPicturedWithNavBar(page, { showing: PROFILE_PAGER });
	expect(await leftEdge(sheet(page))).toBeCloseTo(
		atRest + PHONE.width / 2,
		0,
	);

	expect(await commitSystemBack(page), "the chat takes Back").toBe(false);
	await expect(page).toHaveURL(profileUrl(tiles[0]!));
	await expectLandedWithLiveNavBar(page);
	await expect(liveProfilePager(page)).toBeVisible();
});
