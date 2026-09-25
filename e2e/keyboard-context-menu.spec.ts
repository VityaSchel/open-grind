import { expect, type Page, test } from "@playwright/test";

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

function messageRow(page: Page, text: string) {
	return page
		.locator('[data-slot="message"] [role="button"]')
		.filter({ hasText: text })
		.first();
}

test.describe("keyboard access to context menus", () => {
	test("the context menu key opens a focused message's menu", async ({
		page,
	}) => {
		await openConversation(page);
		const row = messageRow(page, "Hey! Lorem ipsum dolor sit amet.");
		await row.focus();

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
		const row = messageRow(page, "Hey! Lorem ipsum dolor sit amet.");
		await row.focus();

		await page.keyboard.press("Shift+F10");

		await expect(page.locator(MENU)).toHaveCount(1);
	});

	test("Control-click opens a message's menu on macOS", async ({ page }) => {
		test.skip(
			process.platform !== "darwin",
			"Control-click means right-click only on macOS",
		);
		await openConversation(page);

		await messageRow(page, "Hey! Lorem ipsum dolor sit amet.").click({
			modifiers: ["Control"],
		});

		await expect(page.locator(MENU)).toHaveCount(1);
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
