import { expect, type Page, test } from "@playwright/test";

import {
	DEMO_CONVERSATION,
	FIRST_ROUTE_COMPILE_MS,
	installTauriShim,
} from "./support/app";
import {
	backToChats,
	openConversation,
	openInbox,
	sheet,
} from "./support/chat-stack";
import { type Keyboard, sendIosInsets, TEST_INSETS } from "./support/keyboard";
import { LIVE_STACK, PHONE } from "./support/stack-layers";

const KEYBOARD_HEIGHT = 300;
const KEYBOARD_CLOSED: Keyboard = {
	viewport: PHONE,
	insets: { top: 62, bottom: 34, left: 0, right: 0, ime: false },
};
const KEYBOARD_OPEN: Keyboard = {
	viewport: { ...PHONE, height: PHONE.height - KEYBOARD_HEIGHT },
	insets: { ...KEYBOARD_CLOSED.insets, bottom: 0, ime: true },
};
const SLIDE_HOLD_MS = 120;
const SAFE_AREA_STRIP = '[data-slot="safe-area-strip"]';

test.describe.configure({ timeout: 180_000 });
test.use({ viewport: PHONE });

const composerField = (page: Page) =>
	page.getByRole("textbox", { name: "Say something..." });
const sentBubble = (page: Page, { text }: { text: string }) =>
	page.locator('[data-slot="message-bubble"]').filter({ hasText: text });

const stripHeights = (page: Page) =>
	page
		.locator(SAFE_AREA_STRIP)
		.evaluateAll((strips) =>
			strips.map((strip) => strip.getBoundingClientRect().height),
		);

const safeAreaBottom = (page: Page) =>
	page.evaluate(() =>
		document.documentElement.style.getPropertyValue("--safe-area-bottom"),
	);

async function switchIosKeyboard(
	page: Page,
	{ viewport, insets }: Keyboard,
): Promise<void> {
	await sendIosInsets(page, insets);
	await page.setViewportSize(viewport);
	await expect.poll(() => safeAreaBottom(page)).toBe(`${insets.bottom}px`);
}

async function slidingSoonAfterBack(page: Page): Promise<boolean> {
	const watch = await page.evaluateHandle(
		({ baseSelector, sheetSelector, holdMs }) => {
			const basePane = document.querySelector(baseSelector);
			if (!basePane) throw new Error("The live stack has no base pane");
			const sliding = new Promise<boolean>((resolve) => {
				const observer = new MutationObserver(() => {
					if (basePane.hasAttribute("inert")) return;
					observer.disconnect();
					setTimeout(() => {
						const pane = document.querySelector(sheetSelector);
						resolve(
							pane !== null &&
								(pane.getBoundingClientRect().x > 0 ||
									pane
										.getAnimations()
										.some(
											(animation) =>
												animation.playState ===
												"running",
										)),
						);
					}, holdMs);
				});
				observer.observe(basePane, {
					attributes: true,
					attributeFilter: ["inert"],
				});
			});
			return { sliding };
		},
		{
			baseSelector: LIVE_STACK.base,
			sheetSelector: LIVE_STACK.sheet,
			holdMs: SLIDE_HOLD_MS,
		},
	);
	await backToChats(page).click();
	return watch.evaluate(({ sliding }) => sliding);
}

for (const { platform, reads, heights } of [
	{
		platform: "ios",
		reads: "reads the insets the native side set before the page loaded",
		heights: [KEYBOARD_CLOSED.insets.top, KEYBOARD_CLOSED.insets.bottom],
	},
	{
		platform: "android",
		reads: "ignores iOS insets and keeps the test insets",
		heights: [TEST_INSETS.top, TEST_INSETS.bottom],
	},
] as const) {
	test(`the safe area on ${platform} ${reads}`, async ({ page }) => {
		await installTauriShim(page, { platform });
		await page.addInitScript((insets) => {
			window.__iosInsets = insets;
		}, KEYBOARD_CLOSED.insets);
		await page.goto("/chat");
		await page
			.locator(SAFE_AREA_STRIP)
			.first()
			.waitFor({ state: "attached", timeout: FIRST_ROUTE_COMPILE_MS });

		await expect.poll(() => stripHeights(page)).toEqual(heights);
	});
}

for (const { keyboard, slides } of [
	{ keyboard: KEYBOARD_OPEN, slides: "only after the keyboard hides" },
	{ keyboard: KEYBOARD_CLOSED, slides: "at once with the keyboard closed" },
]) {
	test(`Back on iOS slides the conversation out ${slides}`, async ({
		page,
	}) => {
		await openInbox(page, { platform: "ios" });
		await openConversation(page);
		await switchIosKeyboard(page, keyboard);

		expect(await slidingSoonAfterBack(page)).toBe(!keyboard.insets.ime);

		await switchIosKeyboard(page, KEYBOARD_CLOSED);
		await expect(page).toHaveURL(/\/chat$/);
		await expect(sheet(page)).toHaveCount(0);
	});
}

for (const { keyboard, text, focused } of [
	{
		keyboard: KEYBOARD_OPEN,
		text: "Sent with the keyboard up",
		focused: true,
	},
	{
		keyboard: KEYBOARD_CLOSED,
		text: "Sent with the keyboard down",
		focused: false,
	},
]) {
	test(`Send on iOS ${focused ? "keeps" : "lets go of"} the composer focus when the keyboard is ${keyboard.insets.ime ? "open" : "closed"}`, async ({
		page,
	}) => {
		await installTauriShim(page, { platform: "ios" });
		await page.goto(DEMO_CONVERSATION);
		await composerField(page).waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });
		await switchIosKeyboard(page, keyboard);

		await composerField(page).fill(text);
		await page.getByRole("button", { name: "Send message" }).tap();
		await expect(sentBubble(page, { text })).toBeVisible();

		expect(
			await composerField(page).evaluate(
				(field) => field === document.activeElement,
			),
		).toBe(focused);
	});
}
