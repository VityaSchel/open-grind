import { expect, type Locator, type Page, test } from "@playwright/test";

import {
	DEMO_CONVERSATION,
	DEMO_CONVERSATION_ID,
	emitMessageSent,
	installEventInjection,
	installTauriShim,
} from "./support/app";
import { MEDIA_TILE, openAttachments } from "./support/drawer";

const MENU = "dialog[open]";
const PLAY_VIDEO = { name: "Play expiring video" };
const MESSAGE_ACTIONS = { name: "Message actions" };
const GREETING = "Hey! Lorem ipsum dolor sit amet.";
const ME = 123456000;
const THEM = 100001;
const LONG_TEXT = Array.from(
	{ length: 4 },
	() => "Lorem ipsum dolor sit amet, consectetur adipiscing elit.",
).join(" ");

type Box = { left: number; right: number; top: number; bottom: number };

async function openConversation(page: Page): Promise<void> {
	await installTauriShim(page);
	await installEventInjection(page);
	await page.goto(DEMO_CONVERSATION);
	await page
		.locator('[data-slot="message"] [data-slot="message-bubble"]')
		.first()
		.waitFor({ timeout: 60_000 });
}

async function deliverVideo(page: Page): Promise<void> {
	const timestamp = Date.now() + 60_000;
	await emitMessageSent(page, {
		type: "Video",
		body: {
			mediaId: 900_001,
			url: "https://cdns.grindr.com/videos/chat/clip.mp4",
			contentType: "video/mp4",
			length: 8000,
			maxViews: 2,
			viewsRemaining: 2,
			looping: false,
		},
		messageId: `ws-video-${timestamp}`,
		conversationId: DEMO_CONVERSATION_ID,
		senderId: 100001,
		timestamp,
		unsent: false,
		reactions: [],
		replyToMessage: null,
	});
	await page.getByRole("button", PLAY_VIDEO).last().waitFor();
}

async function deliverText(
	page: Page,
	{ text, senderId }: { text: string; senderId: number },
): Promise<void> {
	const timestamp = Date.now() + 60_000;
	await emitMessageSent(page, {
		type: "Text",
		body: { text },
		messageId: `ws-text-${timestamp}`,
		conversationId: DEMO_CONVERSATION_ID,
		senderId,
		timestamp,
		unsent: false,
		reactions: [],
		replyToMessage: null,
	});
	await messageRow(page, text).waitFor();
	await expect.poll(() => distanceFromFloor(page)).toBeLessThanOrEqual(1);
}

function messageRow(page: Page, text: string) {
	return page.getByRole("article").filter({ hasText: text }).first();
}

function messageActions(page: Page, text: string) {
	return messageRow(page, text).getByRole("button", MESSAGE_ACTIONS);
}

function widthOf(target: Locator): Promise<number> {
	return target.evaluate((node) => node.getBoundingClientRect().width);
}

function boxOf(target: Locator): Promise<Box> {
	return target.evaluate((node) => {
		const { left, right, top, bottom } = node.getBoundingClientRect();
		return { left, right, top, bottom };
	});
}

async function focusByKeyboard(target: Locator): Promise<void> {
	await target.focus();
	await target.page().keyboard.press("Shift+Tab");
	await target.page().keyboard.press("Tab");
	await expect(target).toBeFocused();
}

function sidewaysScroll(page: Page): Promise<number> {
	return page
		.locator('[data-slot="messages-scroller"]')
		.evaluate((scroller) => scroller.scrollWidth - scroller.clientWidth);
}

function distanceFromFloor(page: Page): Promise<number> {
	return page
		.locator('[data-slot="messages-scroller"]')
		.evaluate(
			(scroller) =>
				scroller.scrollHeight -
				scroller.clientHeight -
				scroller.scrollTop,
		);
}

test.describe("keyboard access to context menus", () => {
	test("the context menu key opens a focused message's menu", async ({
		page,
	}) => {
		await openConversation(page);
		await messageActions(page, GREETING).focus();

		await page.keyboard.press("ContextMenu");

		await expect(page.locator(MENU)).toHaveCount(1);
		await expect(
			page.getByRole("button", { name: "Delete for me" }),
		).toBeVisible();
	});

	test("Shift+F10 opens a focused message's menu", async ({ page }) => {
		test.skip(
			process.platform === "darwin",
			"Shift+F10 is the Windows and Linux shortcut; macOS has none",
		);
		await openConversation(page);
		await messageActions(page, GREETING).focus();

		await page.keyboard.press("Shift+F10");

		await expect(page.locator(MENU)).toHaveCount(1);
	});

	test("Control-click opens a message's menu on macOS", async ({ page }) => {
		test.skip(
			process.platform !== "darwin",
			"Control-click means right-click only on macOS",
		);
		await openConversation(page);

		await messageRow(page, GREETING).click({ modifiers: ["Control"] });

		await expect(page.locator(MENU)).toHaveCount(1);
	});

	test("a message row is a plain article with its own menu button, not a tab stop or a button around buttons", async ({
		page,
	}) => {
		await openConversation(page);
		await deliverVideo(page);
		const play = page.getByRole("button", PLAY_VIDEO).last();
		const row = page.getByRole("article").filter({ has: play });

		await expect(row).not.toHaveAttribute("tabindex");
		await expect(row).not.toHaveAttribute("aria-keyshortcuts");
		await expect(row.getByRole("button", MESSAGE_ACTIONS)).toHaveAttribute(
			"aria-expanded",
			"false",
		);
		await expect(
			page.getByRole("button").filter({ has: play }),
		).toHaveCount(0);
	});

	test("Tab from the top of the conversation reaches a message's menu button, which shows itself", async ({
		page,
	}) => {
		await openConversation(page);
		await page
			.getByRole("navigation", { name: "Conversation" })
			.getByRole("link")
			.last()
			.focus();

		await page.keyboard.press("Tab");

		const button = page.getByRole("button", MESSAGE_ACTIONS).first();
		await expect(button).toBeFocused();
		await expect(button).toHaveAttribute("aria-haspopup", "dialog");
		await expect(button).toBeInViewport();
		expect(await widthOf(button)).toBeGreaterThan(16);
	});

	test("Enter on a message's menu button opens the menu, and Escape hands focus back", async ({
		page,
	}) => {
		await openConversation(page);
		const button = messageActions(page, GREETING);
		await button.focus();

		await page.keyboard.press("Enter");

		await expect(page.locator(MENU)).toHaveCount(1);
		await expect(
			page.getByRole("button", { name: "Delete for me" }),
		).toBeVisible();

		await page.keyboard.press("Escape");

		await expect(page.locator(MENU)).toHaveCount(0);
		await expect(button).toBeFocused();
		await expect(button).toHaveAttribute("aria-expanded", "false");
	});

	test("Space on a message's menu button opens the menu", async ({
		page,
	}) => {
		await openConversation(page);
		await messageActions(page, GREETING).focus();

		await page.keyboard.press("Space");

		await expect(page.locator(MENU)).toHaveCount(1);
	});

	for (const { side, senderId, gapBeside } of [
		{
			side: "incoming",
			senderId: THEM,
			gapBeside: (button: Box, bubble: Box) => button.left - bubble.right,
		},
		{
			side: "outgoing",
			senderId: ME,
			gapBeside: (button: Box, bubble: Box) => bubble.left - button.right,
		},
	]) {
		test(`an ${side} message's menu button shows beside the bubble's inner side without moving anything`, async ({
			page,
		}) => {
			await page.setViewportSize({ width: 800, height: 800 });
			await openConversation(page);
			const text = `Short ${side} note`;
			await deliverText(page, { text, senderId });
			const bubble = messageRow(page, text).locator(
				'[data-slot="message-bubble"]',
			);
			const button = messageActions(page, text);
			const bubbleBefore = await boxOf(bubble);

			await focusByKeyboard(button);

			const shown = await boxOf(button);
			expect(shown.right - shown.left).toBeGreaterThan(16);
			expect(gapBeside(shown, bubbleBefore)).toBeGreaterThanOrEqual(0);
			expect(gapBeside(shown, bubbleBefore)).toBeLessThan(16);
			expect(
				Math.abs(
					shown.top +
						shown.bottom -
						bubbleBefore.top -
						bubbleBefore.bottom,
				),
			).toBeLessThanOrEqual(2);
			expect(await boxOf(bubble)).toEqual(bubbleBefore);
			expect(await sidewaysScroll(page)).toBe(0);
		});
	}

	test("a focused message's menu button follows its bubble as the window resizes", async ({
		page,
	}) => {
		await page.setViewportSize({ width: 320, height: 800 });
		await openConversation(page);
		const text = "A note that wraps on a narrow phone";
		await deliverText(page, { text, senderId: THEM });
		const bubble = messageRow(page, text).locator(
			'[data-slot="message-bubble"]',
		);
		const button = messageActions(page, text);
		await focusByKeyboard(button);

		await page.setViewportSize({ width: 540, height: 800 });

		await expect(button).toBeFocused();
		await expect
			.poll(async () => {
				const shown = await boxOf(button);
				const beside = await boxOf(bubble);
				return {
					gap: Math.round(shown.left - beside.right),
					offCenter: Math.round(
						Math.abs(
							shown.top +
								shown.bottom -
								beside.top -
								beside.bottom,
						),
					),
				};
			})
			.toEqual({ gap: 4, offCenter: 0 });
	});

	test("Shift+Tab up the conversation never tucks a message's menu button under the bars", async ({
		page,
	}) => {
		await page.setViewportSize({ width: 400, height: 520 });
		await openConversation(page);
		const nav = page.getByRole("navigation", { name: "Conversation" });
		const composer = page.locator('[data-slot="message-composer"]');
		const actions = page.getByRole("button", MESSAGE_ACTIONS);
		const count = await actions.count();
		await page.getByRole("textbox", { name: "Say something..." }).focus();

		const tucked: number[] = [];
		for (let index = count - 1; index >= 0; index -= 1) {
			const button = actions.nth(index);
			for (let press = 0; press < 3; press += 1) {
				if (await button.evaluate((node) => node.matches(":focus")))
					break;
				await page.keyboard.press("Shift+Tab");
			}
			await expect(button).toBeFocused();
			const shown = await boxOf(button);
			if (
				shown.top < (await boxOf(nav)).bottom - 0.5 ||
				shown.bottom > (await boxOf(composer)).top + 0.5
			)
				tucked.push(index);
		}

		expect(count).toBeGreaterThan(3);
		expect(tucked).toEqual([]);
	});

	test("a full-width message's menu button stays inside the row", async ({
		page,
	}) => {
		await openConversation(page);
		await deliverText(page, { text: LONG_TEXT, senderId: THEM });
		const row = messageRow(page, LONG_TEXT);
		const button = messageActions(page, LONG_TEXT);

		await focusByKeyboard(button);

		const shown = await boxOf(button);
		const rowBox = await boxOf(row);
		expect(shown.right - shown.left).toBeGreaterThan(16);
		expect(shown.right).toBeLessThanOrEqual(rowBox.right + 0.5);
		expect(await sidewaysScroll(page)).toBe(0);
	});

	test("a mouse never sees a message's menu button", async ({ page }) => {
		await openConversation(page);
		const row = messageRow(page, GREETING);
		const button = messageActions(page, GREETING);

		await row.hover();
		expect(await widthOf(button)).toBeLessThanOrEqual(1);

		await row.click();
		expect(await widthOf(button)).toBeLessThanOrEqual(1);
	});

	test("Enter on a button inside a message presses the button, not the message menu", async ({
		page,
	}) => {
		await openConversation(page);
		await deliverVideo(page);
		await page.evaluate(() => {
			window.__playPresses = 0;
			document.addEventListener(
				"click",
				(event) => {
					if (
						event.target instanceof Element &&
						event.target.closest('[data-slot="video-message"]')
					) {
						window.__playPresses = (window.__playPresses ?? 0) + 1;
					}
				},
				true,
			);
		});
		await page.getByRole("button", PLAY_VIDEO).last().focus();

		await page.keyboard.press("Enter");

		await expect
			.poll(() => page.evaluate(() => window.__playPresses))
			.toBe(1);
		await expect(page.locator(MENU)).toHaveCount(0);
	});

	test("the context menu key on a button inside a message still opens the message menu", async ({
		page,
	}) => {
		await openConversation(page);
		await deliverVideo(page);
		await page.getByRole("button", PLAY_VIDEO).last().focus();

		await page.keyboard.press("ContextMenu");

		await expect(page.locator(MENU)).toHaveCount(1);
		await expect(
			page.getByRole("button", { name: "Delete for me" }),
		).toBeVisible();

		await page.keyboard.press("Escape");

		await expect(page.getByRole("button", PLAY_VIDEO).last()).toBeFocused();
	});

	test("the context menu key opens a media tile's menu, again after closing", async ({
		page,
	}) => {
		await openAttachments(page);
		const tile = page.locator(MEDIA_TILE).nth(1);

		for (let round = 0; round < 2; round += 1) {
			await tile.focus();
			await page.keyboard.press("ContextMenu");
			await expect(
				page.getByRole("menuitem", { name: "Delete permanently" }),
			).toBeVisible();
			await page.keyboard.press("Escape");
			await expect(page.locator(MENU)).toHaveCount(0);
		}
	});
});

declare global {
	interface Window {
		__playPresses?: number;
	}
}
