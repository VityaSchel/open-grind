import { expect, type Page, test } from "@playwright/test";

import {
	afterTwoFrames,
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
import {
	type Keyboard,
	sendInsets,
	sendIosInsets,
	TEST_INSETS,
} from "./support/keyboard";
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
const CLOSE_RIDE_MS = 1500;
const CLOSE_HOLD_MS = 400;
const LINEAR = [0, 0, 1, 1] as const;
const SAFE_AREA_STRIP = '[data-slot="safe-area-strip"]';
const SAVE_CHANGES_BAR = '[data-slot="save-changes-bar"]';

test.describe.configure({ timeout: 180_000 });
test.use({ viewport: PHONE });

const mainNav = (page: Page) => page.locator('nav[aria-label="Main"]');
const landHeldInsets = (page: Page) =>
	page.evaluate(() => window.dispatchEvent(new Event("resize")));
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

async function rideIosKeyboard(
	page: Page,
	{ from, to, duration }: { from: number; to: number; duration: number },
): Promise<void> {
	await page.evaluate(
		({ insets, motion }) => {
			window.__iosInsets = insets;
			window.__reapplyInsets(window.__iosInsets);
			window.__iosKeyboardMotion?.({
				...motion,
				curve: [...motion.curve],
				startedAt: Date.now(),
			});
		},
		{
			insets: { ...KEYBOARD_CLOSED.insets, ime: to > 0 },
			motion: { from, to, duration, curve: LINEAR },
		},
	);
}

async function slidingSoonAfterBack(
	page: Page,
	{ holdMs = SLIDE_HOLD_MS }: { holdMs?: number } = {},
): Promise<boolean> {
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
			holdMs,
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

test("Back on iOS slides the conversation out only after it rode the keyboard down", async ({
	page,
}) => {
	await openInbox(page, { platform: "ios" });
	await openConversation(page);
	await rideIosKeyboard(page, { from: 0, to: KEYBOARD_HEIGHT, duration: 0 });
	await rideIosKeyboard(page, {
		from: KEYBOARD_HEIGHT,
		to: 0,
		duration: CLOSE_RIDE_MS,
	});

	expect(await slidingSoonAfterBack(page, { holdMs: CLOSE_HOLD_MS })).toBe(
		false,
	);

	await expect(page).toHaveURL(/\/chat$/);
	await expect(sheet(page)).toHaveCount(0);
});

test("Back on iOS slides the conversation out at once with the keyboard closed", async ({
	page,
}) => {
	await openInbox(page, { platform: "ios" });
	await openConversation(page);
	await switchIosKeyboard(page, KEYBOARD_CLOSED);

	expect(await slidingSoonAfterBack(page)).toBe(true);

	await expect(page).toHaveURL(/\/chat$/);
	await expect(sheet(page)).toHaveCount(0);
});

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

for (const { platform, send, revealed } of [
	{ platform: "ios", send: sendIosInsets, revealed: true },
	{ platform: "android", send: sendInsets, revealed: false },
] as const) {
	test(`a field the keyboard covers on ${platform} ${revealed ? "scrolls into view" : "is left to the WebView"}`, async ({
		page,
	}) => {
		await installTauriShim(page, { platform });
		await page.goto("/settings/profile");
		const about = page.getByLabel("About me", { exact: true });
		await about.waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });
		const fieldBottom = () =>
			about.evaluate((field) => field.getBoundingClientRect().bottom);
		await about.evaluate((field) => {
			field.scrollIntoView({ block: "end" });
			field.focus({ preventScroll: true });
		});
		expect(await fieldBottom()).toBeGreaterThan(
			KEYBOARD_OPEN.viewport.height,
		);

		await send(page, KEYBOARD_OPEN.insets);
		await page.setViewportSize(KEYBOARD_OPEN.viewport);
		await expect.poll(() => safeAreaBottom(page)).toBe("0px");
		await afterTwoFrames(page);

		expect((await fieldBottom()) <= KEYBOARD_OPEN.viewport.height).toBe(
			revealed,
		);
		await expect(about).toBeFocused();
	});
}

for (const { platform, send, revealed } of [
	{ platform: "ios", send: sendIosInsets, revealed: true },
	{ platform: "android", send: sendInsets, revealed: false },
] as const) {
	test(`a field the save bar lands on while typing on ${platform} ${revealed ? "scrolls above it" : "is left to the WebView"}`, async ({
		page,
	}) => {
		await installTauriShim(page, { platform });
		await page.goto("/settings/profile");
		const instagram = page.getByRole("textbox", {
			name: "Instagram",
			exact: true,
		});
		await instagram.waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });
		await instagram.evaluate((field) =>
			field.focus({ preventScroll: true }),
		);
		await send(page, KEYBOARD_OPEN.insets);
		await page.setViewportSize(KEYBOARD_OPEN.viewport);
		await expect(mainNav(page)).toBeHidden();
		await instagram.evaluate((field) =>
			field.scrollIntoView({ block: "end" }),
		);
		await afterTwoFrames(page);

		const watch = await page.evaluateHandle((selector) => {
			const landed = new Promise<void>((resolve) => {
				window.addEventListener(
					"introend",
					({ target }) => {
						if (
							target instanceof Element &&
							target.matches(selector)
						)
							resolve();
					},
					{ capture: true },
				);
			});
			return { landed };
		}, SAVE_CHANGES_BAR);
		await page.keyboard.type("y");
		await watch.evaluate(({ landed }) => landed);
		await afterTwoFrames(page);

		const overlap = await instagram.evaluate((field, selector) => {
			const bar = document.querySelector(selector);
			if (!bar) throw new Error("The save bar is gone");
			return (
				field.getBoundingClientRect().bottom -
				bar.getBoundingClientRect().top
			);
		}, SAVE_CHANGES_BAR);
		expect(overlap < 1).toBe(revealed);
		await expect(instagram).toBeFocused();
	});
}

for (const { platform, send } of [
	{ platform: "ios", send: sendIosInsets },
	{ platform: "android", send: sendInsets },
] as const) {
	test(`the nav bar on ${platform} steps aside while the keyboard is up so a field can sit right on it, and comes back once it closes`, async ({
		page,
	}) => {
		await installTauriShim(page, { platform });
		await page.goto("/settings/profile");
		const about = page.getByLabel("About me", { exact: true });
		await about.waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });
		await expect(mainNav(page)).toBeVisible();
		await about.evaluate((field) => field.focus({ preventScroll: true }));

		await send(page, KEYBOARD_OPEN.insets);
		await page.setViewportSize(KEYBOARD_OPEN.viewport);
		await expect(mainNav(page)).toBeHidden();
		await about.evaluate((field) => field.scrollIntoView({ block: "end" }));
		await afterTwoFrames(page);

		expect(
			await about.evaluate((field) => {
				const { left, right, bottom } = field.getBoundingClientRect();
				const hit = document.elementFromPoint(
					(left + right) / 2,
					bottom - 2,
				);
				return {
					bottom: Math.round(bottom),
					uncovered: hit !== null && field.contains(hit),
				};
			}),
		).toEqual({ bottom: KEYBOARD_OPEN.viewport.height, uncovered: true });

		await send(page, KEYBOARD_CLOSED.insets);
		await page.setViewportSize(KEYBOARD_CLOSED.viewport);
		await expect(mainNav(page)).toBeVisible();
	});
}

test("the nav bar on macOS stays whatever the insets say about a keyboard", async ({
	page,
}) => {
	await installTauriShim(page, { platform: "macos" });
	await page.goto("/settings/profile");
	await mainNav(page).waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });

	await sendInsets(page, KEYBOARD_OPEN.insets);
	await page.setViewportSize(KEYBOARD_OPEN.viewport);
	await afterTwoFrames(page);

	await expect(mainNav(page)).toBeVisible();
});

test("the nav bar on iOS stays under a conversation that follows the keyboard and never blinks on the inbox after Back with the keyboard up", async ({
	page,
}) => {
	await openInbox(page, { platform: "ios" });
	await openConversation(page);
	await rideIosKeyboard(page, { from: 0, to: KEYBOARD_HEIGHT, duration: 0 });
	await landHeldInsets(page);
	await afterTwoFrames(page);

	expect(
		await mainNav(page).evaluate((nav) => nav.hasAttribute("hidden")),
	).toBe(false);

	const navHiddenChanges = await page.evaluateHandle(() => {
		const changes: boolean[] = [];
		new MutationObserver((records) => {
			for (const { target } of records)
				if (
					target instanceof Element &&
					target.matches('nav[aria-label="Main"]')
				)
					changes.push(target.hasAttribute("hidden"));
		}).observe(document.body, {
			attributes: true,
			attributeFilter: ["hidden"],
			subtree: true,
		});
		return changes;
	});
	await rideIosKeyboard(page, {
		from: KEYBOARD_HEIGHT,
		to: 0,
		duration: CLOSE_RIDE_MS,
	});
	await backToChats(page).click();
	await expect(sheet(page)).toHaveCount(0);
	await expect(mainNav(page)).toBeVisible();
	expect(await navHiddenChanges.jsonValue()).toEqual([]);
});
