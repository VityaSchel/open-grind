import { expect, type Locator, type Page, test } from "@playwright/test";

import {
	DEMO_CONVERSATION,
	FIRST_ROUTE_COMPILE_MS,
	installTauriShim,
	openGrid,
} from "./support/app";
import {
	enableTracking,
	gpsSwitch,
	launchGrid,
	locationButton,
} from "./support/gps";
import { goToRightNow, RIGHT_NOW_FEED_TIMEOUT } from "./support/right-now";

const DEMO_PROFILE = "/profile/100001";
const PHONE = { width: 420, height: 800 };
const DESKTOP = { width: 1280, height: 800 };
const TRAP_PRESSES = 12;
const TEXT_ENTRY =
	"textarea, [contenteditable], input:not([type=checkbox], [type=radio], [type=range], [type=button], [type=submit])";

type Overlay = {
	name: string;
	viewport: { width: number; height: number };
	visit: (page: Page) => Promise<void>;
	trigger: (page: Page) => Locator;
	overlay: (page: Page) => Locator;
	target: (overlay: Locator) => Locator;
	tapTarget?: (overlay: Locator) => Locator;
};

const dialog = (page: Page) => page.getByRole("dialog");

async function visitConversation(page: Page): Promise<void> {
	await page.goto(DEMO_CONVERSATION);
	await page
		.getByRole("article")
		.first()
		.waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });
}

async function visitInbox(page: Page): Promise<void> {
	await page.goto("/chat");
	await page
		.locator("a[href^='/chat/']")
		.first()
		.waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });
}

async function visitRightNow(page: Page): Promise<void> {
	await goToRightNow(page);
	await page
		.getByRole("article")
		.first()
		.waitFor({ timeout: RIGHT_NOW_FEED_TIMEOUT });
}

async function visitProfile(page: Page): Promise<void> {
	await page.goto(DEMO_PROFILE);
	await page
		.getByRole("button", { name: "Profile menu" })
		.waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });
}

const DRAWERS: Overlay[] = [
	{
		name: "the attachments drawer",
		viewport: PHONE,
		visit: visitConversation,
		trigger: (page) => page.getByRole("button", { name: "Add attachment" }),
		overlay: dialog,
		target: (overlay) => overlay.getByRole("tab", { selected: true }),
	},
	{
		name: "the GIFs and stickers drawer",
		viewport: PHONE,
		visit: visitConversation,
		trigger: (page) =>
			page.getByRole("button", { name: "GIFs and stickers" }),
		overlay: dialog,
		target: (overlay) => overlay.getByRole("tab", { selected: true }),
	},
	{
		name: "the age filter",
		viewport: PHONE,
		visit: openGrid,
		trigger: (page) =>
			page.getByRole("button", { name: "Age", exact: true }),
		overlay: dialog,
		target: (overlay) =>
			overlay.getByRole("slider", { name: "Minimum Age" }),
	},
	{
		name: "the position filter",
		viewport: PHONE,
		visit: openGrid,
		trigger: (page) =>
			page.getByRole("button", { name: "Position", exact: true }),
		overlay: dialog,
		target: (overlay) =>
			overlay.getByRole("button", { name: "Top", exact: true }),
	},
	{
		name: "the inbox distance filter",
		viewport: PHONE,
		visit: visitInbox,
		trigger: (page) =>
			page.getByRole("button", { name: "Distance", exact: true }),
		overlay: dialog,
		target: (overlay) =>
			overlay.getByRole("slider", { name: "Maximum Distance" }),
	},
	{
		name: "the Right Now hosting filter",
		viewport: PHONE,
		visit: visitRightNow,
		trigger: (page) =>
			page.getByRole("button", { name: "Hosting", exact: true }),
		overlay: dialog,
		target: (overlay) => overlay.getByRole("radio", { checked: true }),
	},
	{
		name: "the location picker",
		viewport: PHONE,
		visit: openGrid,
		trigger: (page) =>
			page.getByRole("button", { name: "Change location" }),
		overlay: dialog,
		target: (overlay) => overlay,
	},
	{
		name: "the favorite note editor",
		viewport: PHONE,
		visit: visitProfile,
		trigger: (page) => page.getByRole("button", { name: "Add note" }),
		overlay: dialog,
		target: (overlay) => overlay.getByRole("textbox").first(),
		tapTarget: (overlay) => overlay,
	},
];

const textEntryFocused = (page: Page) =>
	page.evaluate(
		(selector) => document.activeElement?.matches(selector) ?? false,
		TEXT_ENTRY,
	);

const focusInside = (overlay: Locator) =>
	overlay.evaluate((node) => node.contains(document.activeElement));

async function openFromKeyboard({
	trigger,
	overlay,
}: {
	trigger: Locator;
	overlay: Locator;
}): Promise<void> {
	await trigger.focus();
	await trigger.page().keyboard.press("Enter");
	await overlay.waitFor();
}

async function expectFocusTrapped({
	page,
	overlay,
}: {
	page: Page;
	overlay: Locator;
}): Promise<void> {
	for (const key of ["Tab", "Shift+Tab"]) {
		for (let press = 1; press <= TRAP_PRESSES; press++) {
			await page.keyboard.press(key);
			expect(
				await focusInside(overlay),
				`${key} press ${press} left the overlay`,
			).toBe(true);
		}
	}
}

async function expectEscapeReturnsFocus({
	page,
	overlay,
	trigger,
}: {
	page: Page;
	overlay: Locator;
	trigger: Locator;
}): Promise<void> {
	await page.keyboard.press("Escape");
	await expect(overlay).toBeHidden();
	await expect(trigger).toBeFocused();
}

test.describe.configure({ timeout: 240_000 });

test.beforeEach(async ({ page }) => {
	await installTauriShim(page, { platform: "macos" });
});

for (const drawer of DRAWERS) {
	test.describe(drawer.name, () => {
		test.use({ viewport: drawer.viewport });

		test("opened from the keyboard, focuses its initial target, keeps Tab inside and returns focus on Escape", async ({
			page,
		}) => {
			await drawer.visit(page);
			const trigger = drawer.trigger(page);
			const overlay = drawer.overlay(page);
			await openFromKeyboard({ trigger, overlay });
			await expect(drawer.target(overlay)).toBeFocused();
			await expectFocusTrapped({ page, overlay });
			await expectEscapeReturnsFocus({ page, overlay, trigger });
		});

		test.describe("by touch", () => {
			test.use({ hasTouch: true });

			test("opened with a tap, moves focus inside without focusing a text field", async ({
				page,
			}) => {
				await drawer.visit(page);
				const overlay = drawer.overlay(page);
				await drawer.trigger(page).tap();
				await overlay.waitFor();
				await expect.poll(() => focusInside(overlay)).toBe(true);
				const tapTarget = drawer.tapTarget ?? drawer.target;
				await expect(tapTarget(overlay)).toBeFocused();
				expect(await textEntryFocused(page)).toBe(false);
			});
		});
	});
}

test.describe("the report sheet", () => {
	test.use({ viewport: PHONE });

	async function openReportFromKeyboard(page: Page): Promise<Locator> {
		await visitProfile(page);
		await page.getByRole("button", { name: "Profile menu" }).focus();
		await page.keyboard.press("Enter");
		await page.getByRole("menuitem", { name: "Report user" }).focus();
		await page.keyboard.press("Enter");
		const overlay = dialog(page);
		await overlay.waitFor();
		return overlay;
	}

	test("opened from the profile menu by keyboard, focuses the first reason and stays inside", async ({
		page,
	}) => {
		const overlay = await openReportFromKeyboard(page);
		await expect(
			overlay.getByRole("radio", { name: "Spam" }),
		).toBeFocused();
		await expectFocusTrapped({ page, overlay });
		await page.keyboard.press("Escape");
		await expect(overlay).toBeHidden();
		await expect(
			page.getByRole("button", { name: "Profile menu" }),
		).toBeFocused();
	});

	test("submitting with Enter moves focus to Done, never to Block", async ({
		page,
	}) => {
		const overlay = await openReportFromKeyboard(page);
		const spam = overlay.getByRole("radio", { name: "Spam" });
		await expect(spam).toBeFocused();
		await page.keyboard.press("Space");
		await expect(spam).toBeChecked();
		await page.keyboard.press("Tab");
		await expect(
			overlay.getByRole("button", { name: "Submit report" }),
		).toBeFocused();
		await page.keyboard.press("Enter");
		await expect(
			overlay.getByRole("heading", { name: "Report submitted" }),
		).toBeVisible();
		await expect(
			overlay.getByRole("button", { name: "Done" }),
		).toBeFocused();
	});

	test.describe("by touch", () => {
		test.use({ hasTouch: true });

		test("opened with a tap, focuses the first reason", async ({
			page,
		}) => {
			await visitProfile(page);
			await page.getByRole("button", { name: "Profile menu" }).tap();
			await page.getByRole("menuitem", { name: "Report user" }).tap();
			const overlay = dialog(page);
			await overlay.waitFor();
			await expect(
				overlay.getByRole("radio", { name: "Spam" }),
			).toBeFocused();
		});
	});
});

for (const viewport of [PHONE, DESKTOP]) {
	test.describe(`the Right Now post sheet at ${viewport.width}px`, () => {
		test.use({ viewport });

		test("confirming a join by keyboard starts on Cancel, then the sheet focuses itself rather than the visibility switch", async ({
			page,
		}) => {
			await visitRightNow(page);
			const join = page.getByRole("button", { name: "Join · 3 left" });
			const confirm = page.getByRole("alertdialog", {
				name: "Join Right Now?",
			});
			await openFromKeyboard({ trigger: join, overlay: confirm });
			await expect(
				confirm.getByRole("button", { name: "Cancel" }),
			).toBeFocused();
			await expectFocusTrapped({ page, overlay: confirm });
			await confirm.getByRole("button", { name: "Join now" }).focus();
			await page.keyboard.press("Enter");
			const sheet = page.getByRole("dialog", { name: "Right Now" });
			await sheet.waitFor();
			await expect(sheet).toBeFocused();
			await expect(
				sheet.getByRole("switch", { name: "Show my post" }),
			).toBeEnabled();
			await expectFocusTrapped({ page, overlay: sheet });
			await page.keyboard.press("Escape");
			await expect(sheet).toBeHidden();

			const pill = page.getByRole("button", {
				name: /^Your Right Now post, .+ left$/,
			});
			await openFromKeyboard({ trigger: pill, overlay: sheet });
			await expect(sheet).toBeFocused();
			await expect(
				sheet.getByRole("switch", { name: "Show my post" }),
			).toBeEnabled();
			await expectEscapeReturnsFocus({
				page,
				overlay: sheet,
				trigger: pill,
			});
		});
	});
}

test.describe("the location picker with GPS tracking on", () => {
	test("opened from the keyboard, focuses the tracking switch that unlocks the map", async ({
		page,
	}) => {
		await launchGrid(page);
		await enableTracking(page);
		const overlay = dialog(page);
		await expect(overlay).toBeHidden();
		await openFromKeyboard({ trigger: locationButton(page), overlay });
		await expect(gpsSwitch(page)).toBeFocused();
		await expect(gpsSwitch(page)).toHaveAttribute("data-state", "checked");
	});
});

test.describe("alert dialogs", () => {
	test.use({ viewport: PHONE });

	test("the sign out confirmation focuses Cancel, keeps Tab inside and returns focus on Escape", async ({
		page,
	}) => {
		await page.goto("/settings");
		const trigger = page.getByRole("button", { name: "Sign out" });
		await trigger.waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });
		const overlay = page.getByRole("alertdialog", { name: "Sign out?" });
		await openFromKeyboard({ trigger, overlay });
		await expect(
			overlay.getByRole("button", { name: "Cancel" }),
		).toBeFocused();
		await expectFocusTrapped({ page, overlay });
		await expectEscapeReturnsFocus({ page, overlay, trigger });
	});

	test("discarding a dirty note focuses Keep editing and hands focus back to the note", async ({
		page,
	}) => {
		await visitProfile(page);
		const editor = page.getByRole("dialog");
		await openFromKeyboard({
			trigger: page.getByRole("button", { name: "Add note" }),
			overlay: editor,
		});
		const note = editor.getByRole("textbox").first();
		await expect(note).toBeFocused();
		await page.keyboard.type("Met at the gym");
		await page.keyboard.press("Escape");
		const discard = page.getByRole("alertdialog");
		await discard.waitFor();
		await expect(
			discard.getByRole("button", { name: "Keep editing" }),
		).toBeFocused();
		await expectFocusTrapped({ page, overlay: discard });
		await page.keyboard.press("Escape");
		await expect(discard).toBeHidden();
		await expect(note).toBeFocused();
	});

	test.describe("by touch", () => {
		test.use({ hasTouch: true });

		test("the sign out confirmation opened with a tap focuses Cancel", async ({
			page,
		}) => {
			await page.goto("/settings");
			const trigger = page.getByRole("button", { name: "Sign out" });
			await trigger.waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });
			await trigger.tap();
			const overlay = page.getByRole("alertdialog", {
				name: "Sign out?",
			});
			await overlay.waitFor();
			await expect(
				overlay.getByRole("button", { name: "Cancel" }),
			).toBeFocused();
		});
	});
});
