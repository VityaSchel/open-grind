import { expect, type Page, test } from "@playwright/test";

import {
	afterTwoFrames,
	DEMO_CONVERSATION,
	FIRST_ROUTE_COMPILE_MS,
	installTauriShim,
	MESSAGE_ROW,
	openGrid,
} from "./support/app";
import {
	backToChats,
	dim,
	openConversation,
	rows,
	sheet,
} from "./support/chat-stack";
import {
	APP_SETTINGS,
	CREDITS,
	openAppSettings,
	pane,
	SETTINGS,
	STACK_PANE,
	stackSettled,
} from "./support/page-stack";
import { activeProfilePane, openTile, tileIds } from "./support/profile-pager";
import { PHONE } from "./support/stack-layers";
import {
	edgeSwipeArmed,
	edgeSwipeArmsSent,
	fakeIosEdgeSwipe,
	progressEdgeSwipe,
	releaseEdgeSwipe,
	startEdgeSwipe,
	startEdgeSwipeUnarmed,
} from "./support/system-back";

test.describe.configure({ timeout: 180_000 });
test.use({ viewport: PHONE });

const REPLIABLE = "consectetur adipiscing elit";

async function openOnIos(page: Page, path: string) {
	await installTauriShim(page, { platform: "ios" });
	await fakeIosEdgeSwipe(page);
	await page.goto(path);
}

async function openSettingsOnIos(page: Page) {
	await openOnIos(page, SETTINGS);
	await page
		.getByRole("link", { name: "App Settings" })
		.waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });
}

async function openInboxOnIos(page: Page) {
	await openOnIos(page, "/chat");
	await rows(page).nth(1).waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });
}

const paneX = (page: Page) =>
	pane(page).evaluate((element) => element.getBoundingClientRect().x);

const expectArmed = (page: Page, armed: boolean) =>
	expect.poll(() => edgeSwipeArmed(page)).toBe(armed);

async function expectStaysOff(page: Page) {
	const sentBefore = (await edgeSwipeArmsSent(page)).length;
	await afterTwoFrames(page);
	await page.evaluate(() => new Promise((folded) => setTimeout(folded)));

	expect((await edgeSwipeArmsSent(page)).slice(sentBefore)).not.toContain(
		true,
	);
	expect(await edgeSwipeArmed(page)).toBe(false);
	expect(await startEdgeSwipeUnarmed(page)).toBe(false);
}

function releaseReadingEasing(
	page: Page,
	{
		selector,
		release,
	}: { selector: string; release: { commit: boolean; velocity: number } },
) {
	return page.evaluate(
		({ selector, release }) => {
			window.__iosBack?.finish(release);
			return (
				document
					.querySelector(selector)
					?.getAnimations()
					.map((animation) => animation.effect?.getTiming().easing) ??
				[]
			);
		},
		{ selector, release },
	);
}

test.describe("the iOS edge swipe in settings", () => {
	test("follows the finger from App Settings and lets go onto Settings at the finger's speed", async ({
		page,
	}) => {
		await openSettingsOnIos(page);
		await openAppSettings(page);
		await expectArmed(page, true);

		expect(await startEdgeSwipe(page)).toBe(true);
		await progressEdgeSwipe(page, 0.5);
		expect(await paneX(page)).toBeCloseTo(PHONE.width / 2, 0);

		const easings = await releaseReadingEasing(page, {
			selector: STACK_PANE,
			release: { commit: true, velocity: 1.2 },
		});
		expect(easings.some((easing) => easing?.startsWith("linear("))).toBe(
			true,
		);
		await expect(page).toHaveURL(new RegExp(`${SETTINGS}$`));
		await stackSettled(page);
		await expectArmed(page, false);
	});

	test("slides App Settings back in when the swipe is let go short", async ({
		page,
	}) => {
		await openSettingsOnIos(page);
		await openAppSettings(page);
		await expectArmed(page, true);

		expect(await startEdgeSwipe(page)).toBe(true);
		await progressEdgeSwipe(page, 0.3);
		await releaseEdgeSwipe(page, { commit: false, velocity: -0.5 });

		await stackSettled(page);
		expect(await paneX(page)).toBe(0);
		await expect(page).toHaveURL(new RegExp(`${APP_SETTINGS}$`));
		await expectArmed(page, true);
	});

	test("stays off where no settings page lies behind", async ({ page }) => {
		await openSettingsOnIos(page);
		await expectStaysOff(page);

		await openOnIos(page, CREDITS);
		await pane(page).waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });
		await stackSettled(page);
		await expectStaysOff(page);
	});
});

test.describe("the iOS edge swipe in chats", () => {
	const messageRow = (page: Page) =>
		page.locator(MESSAGE_ROW).filter({ hasText: REPLIABLE });

	test("pops a conversation opened from the inbox and keeps its armed reply in the draft", async ({
		page,
	}) => {
		await openInboxOnIos(page);
		await openConversation(page, { href: DEMO_CONVERSATION });
		await expectArmed(page, true);
		await messageRow(page).click({ button: "right" });
		await expectArmed(page, false);
		await page.getByRole("button", { name: "Reply" }).click();
		await expect(page.getByLabel("Cancel reply")).toBeVisible();
		await expectArmed(page, true);

		expect(await startEdgeSwipe(page)).toBe(true);
		await progressEdgeSwipe(page, 0.6);
		await releaseEdgeSwipe(page, { commit: true, velocity: 1 });

		await expect(page).toHaveURL(/\/chat$/);
		await expect(sheet(page)).toHaveCount(0);
		await openConversation(page, { href: DEMO_CONVERSATION });
		await expect(page.getByLabel("Cancel reply")).toBeVisible();
	});

	test("covers the list again when the swipe is let go short", async ({
		page,
	}) => {
		await openInboxOnIos(page);
		const href = await openConversation(page);
		await expectArmed(page, true);

		expect(await startEdgeSwipe(page)).toBe(true);
		await progressEdgeSwipe(page, 0.2);
		await releaseEdgeSwipe(page, { commit: false, velocity: 0 });

		await expect(dim(page)).toHaveCount(0, { timeout: 5_000 });
		await expect(page).toHaveURL(new RegExp(`${href}$`));
	});

	test("stays off in a conversation that was not opened from the inbox", async ({
		page,
	}) => {
		await openOnIos(page, DEMO_CONVERSATION);
		await backToChats(page).waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });

		await expectStaysOff(page);
	});
});

test("the iOS edge swipe stays off on a profile and in the chat opened from it", async ({
	page,
}) => {
	await installTauriShim(page, { platform: "ios" });
	await fakeIosEdgeSwipe(page);
	await openGrid(page);
	await page
		.locator('.photo-grid a[href^="/profile/"]')
		.nth(8)
		.waitFor({ timeout: 60_000 });
	await openTile(page, { tiles: await tileIds(page), nth: 0 });
	await expectStaysOff(page);

	await activeProfilePane(page)
		.getByRole("link", { name: "Write a message..." })
		.click();
	await expect(page).toHaveURL(/\/chat\//);
	await backToChats(page).waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });
	await expectStaysOff(page);
});
