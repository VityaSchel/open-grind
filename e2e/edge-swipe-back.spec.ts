import { expect, type Locator, type Page, test } from "@playwright/test";

import { DEV_SERVER_URL } from "../playwright.config";
import {
	afterTwoFrames,
	backLink,
	DEMO_CONVERSATION,
	FIRST_ROUTE_COMPILE_MS,
	installTauriShim,
	MESSAGE_ROW,
} from "./support/app";
import {
	backToInbox,
	dim,
	openConversation,
	openInbox,
	sheet,
} from "./support/chat-stack";
import {
	APP_SETTINGS,
	CREDITS,
	ghost,
	openAppSettings,
	openSettings,
	pane,
	SETTINGS,
	STACK_PANE,
	stackSettled,
} from "./support/page-stack";
import { activeProfilePane, openGridProfile } from "./support/profile-pager";
import { PHONE } from "./support/stack-layers";
import {
	commitSystemBack,
	edgeSwipeArmed,
	edgeSwipeArmsSent,
	progressEdgeSwipe,
	progressSystemBack,
	releaseEdgeSwipe,
	startEdgeSwipe,
	startEdgeSwipeUnarmed,
	startSystemBack,
} from "./support/system-back";

test.describe.configure({ timeout: 180_000 });
test.use({ viewport: PHONE });

const REPLIABLE = "consectetur adipiscing elit";
const ACCOUNT_SETTINGS = `${SETTINGS}/account`;
const BLOCKED = `${ACCOUNT_SETTINGS}/blocked`;
const LANGUAGE = `${APP_SETTINGS}/language`;
const SECURITY = `${APP_SETTINGS}/security`;
const DISCREET_ICON = `${APP_SETTINGS}/discreet-icon`;

const endsWith = (path: string) => new RegExp(`${path}$`);

const linkTo = (path: string) => `a[href="${path}"]`;

async function openSubpage(page: Page, { path }: { path: string }) {
	await pane(page).locator(linkTo(path)).click();
	await expect(page).toHaveURL(endsWith(path), {
		timeout: FIRST_ROUTE_COMPILE_MS,
	});
	await stackSettled(page);
}

const leftEdge = (locator: Locator) =>
	locator.evaluate((element) => element.getBoundingClientRect().x);

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
		await openSettings(page, { platform: "ios" });
		await openAppSettings(page);
		await expectArmed(page, true);

		expect(await startEdgeSwipe(page)).toBe(true);
		await progressEdgeSwipe(page, 0.5);
		expect(await leftEdge(pane(page))).toBeCloseTo(PHONE.width / 2, 0);

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
		await openSettings(page, { platform: "ios" });
		await openAppSettings(page);
		await expectArmed(page, true);

		expect(await startEdgeSwipe(page)).toBe(true);
		await progressEdgeSwipe(page, 0.3);
		await releaseEdgeSwipe(page, { commit: false, velocity: -0.5 });

		await stackSettled(page);
		expect(await leftEdge(pane(page))).toBe(0);
		await expect(page).toHaveURL(new RegExp(`${APP_SETTINGS}$`));
		await expectArmed(page, true);
	});

	test("stays off where no settings page lies behind", async ({ page }) => {
		await openSettings(page, { platform: "ios" });
		await expectStaysOff(page);

		await page.goto(CREDITS);
		await pane(page).waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });
		await stackSettled(page);
		await expectStaysOff(page);
	});

	test("goes back over Account Settings from the blocked list after a visit to a blocked profile", async ({
		page,
	}) => {
		await openSettings(page, { platform: "ios" });
		await openSubpage(page, { path: ACCOUNT_SETTINGS });
		await openSubpage(page, { path: BLOCKED });
		await page.locator('a[href^="/profile/"]').first().click();
		await expect(page).toHaveURL(/\/profile\/\d+$/);
		await backLink(page).click();
		await expect(page).toHaveURL(endsWith(BLOCKED));
		await stackSettled(page);
		await expectArmed(page, true);

		expect(await startEdgeSwipe(page)).toBe(true);
		await progressEdgeSwipe(page, 0.5);
		await expect(ghost(page).locator(linkTo(BLOCKED))).toHaveCount(1);
		await releaseEdgeSwipe(page, { commit: true, velocity: 1 });

		await expect(page).toHaveURL(endsWith(ACCOUNT_SETTINGS));
		await stackSettled(page);
	});
});

test.describe("the iOS edge swipe in settings after a language change", () => {
	test.use({ baseURL: DEV_SERVER_URL });

	test("stays off over pages kept in the old language until the next push keeps one in the new language", async ({
		page,
	}) => {
		await openSettings(page, { platform: "ios" });
		await openAppSettings(page);
		await openSubpage(page, { path: LANGUAGE });
		await expectArmed(page, true);

		await page
			.getByRole("radio", { name: "German Deutsch", exact: true })
			.click();
		await expect(page.locator("html")).toHaveAttribute("lang", "de");
		await expectArmed(page, false);
		await expectStaysOff(page);

		await page.locator("nav").locator(linkTo(APP_SETTINGS)).click();
		await expect(page).toHaveURL(endsWith(APP_SETTINGS));
		await stackSettled(page);
		await expectStaysOff(page);

		await openSubpage(page, { path: CREDITS });
		await expectArmed(page, true);

		expect(await startEdgeSwipe(page)).toBe(true);
		await progressEdgeSwipe(page, 0.5);
		await expect(ghost(page)).toContainText("Deutsch");
		await releaseEdgeSwipe(page, { commit: true, velocity: 1 });

		await expect(page).toHaveURL(endsWith(APP_SETTINGS));
		await stackSettled(page);
		await expectArmed(page, false);
	});
});

async function openWithDisguises(page: Page, { path }: { path: string }) {
	await installTauriShim(page, { platform: "android" });
	await page.addInitScript(() => {
		const internals = (
			window as unknown as {
				__TAURI_INTERNALS__: {
					invoke: (
						cmd: string,
						args?: unknown,
						opts?: unknown,
					) => unknown;
				};
			}
		).__TAURI_INTERNALS__;
		const passThrough = internals.invoke;
		internals.invoke = (cmd, args, opts) =>
			cmd === "disguise_state"
				? Promise.resolve({
						available: true,
						current: "original",
						presets: [],
						renameNeedsAdmin: false,
					})
				: passThrough(cmd, args, opts);
	});
	await page.goto(path);
	await pane(page).waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });
	await stackSettled(page);
}

test("Android's predictive back from the Discreet App Icon reached from Security reveals Security", async ({
	page,
}) => {
	await openWithDisguises(page, { path: APP_SETTINGS });
	await openSubpage(page, { path: SECURITY });
	await openSubpage(page, { path: DISCREET_ICON });

	expect(await startSystemBack(page)).toBe(true);
	await progressSystemBack(page, 0.5);
	await expect(ghost(page).locator(linkTo(DISCREET_ICON))).toHaveCount(1);
	await expect(ghost(page).locator(linkTo(CREDITS))).toHaveCount(0);

	expect(await commitSystemBack(page)).toBe(false);
	await expect(page).toHaveURL(endsWith(SECURITY));
	await stackSettled(page);
});

test.describe("the iOS edge swipe in chats", () => {
	const messageRow = (page: Page) =>
		page.locator(MESSAGE_ROW).filter({ hasText: REPLIABLE });

	test("pops a conversation opened from the inbox and keeps its armed reply in the draft", async ({
		page,
	}) => {
		await openInbox(page, { platform: "ios" });
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
		await openInbox(page, { platform: "ios" });
		const href = await openConversation(page);
		await expectArmed(page, true);

		expect(await startEdgeSwipe(page)).toBe(true);
		await progressEdgeSwipe(page, 0.2);
		await releaseEdgeSwipe(page, { commit: false, velocity: 0 });

		await expect(dim(page)).toHaveCount(0, { timeout: 5_000 });
		expect(await leftEdge(sheet(page))).toBe(0);
		await expect(page).toHaveURL(new RegExp(`${href}$`));
	});

	test("stays off in a conversation that was not opened from the inbox", async ({
		page,
	}) => {
		await installTauriShim(page, { platform: "ios" });
		await page.goto(DEMO_CONVERSATION);
		await backToInbox(page).waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });

		await expectStaysOff(page);
	});
});

test("the iOS edge swipe stays off on a profile and in the chat opened from it", async ({
	page,
}) => {
	await openGridProfile(page, { nth: 0, platform: "ios" });
	await expectStaysOff(page);

	await activeProfilePane(page)
		.getByRole("link", { name: "Write a message…" })
		.click();
	await expect(page).toHaveURL(/\/chat\//);
	await backToInbox(page).waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });
	await expectStaysOff(page);
});
