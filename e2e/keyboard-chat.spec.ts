import { expect, type Locator, type Page, test } from "@playwright/test";

import {
	DEMO_CONVERSATION,
	DEMO_CONVERSATION_ID,
	emitMessageSent,
	FIRST_ROUTE_COMPILE_MS,
	installEventInjection,
	installTauriShim,
} from "./support/app";
import { arrowThrough, focusProblems } from "./support/focus";

const MESSAGE_ACTIONS = { name: "Message actions" };
const MESSAGES_SCROLLER = '[data-slot="messages-scroller"]';
const PLAY_VIDEO = { name: "Play expiring video" };
const THEM = 100001;

function actionsButtons(page: Page): Locator {
	return page.getByRole("button", MESSAGE_ACTIONS);
}

async function tabFromNavBar(page: Page): Promise<void> {
	await page
		.getByRole("navigation", { name: "Conversation" })
		.getByRole("link")
		.last()
		.focus();
	await page.keyboard.press("Tab");
}

async function openConversation(page: Page): Promise<void> {
	await installTauriShim(page);
	await installEventInjection(page);
	await page.goto(DEMO_CONVERSATION);
	await page
		.getByRole("article")
		.first()
		.waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });
}

function focusIsInAMessage(page: Page): Promise<boolean> {
	return page.evaluate(
		() =>
			(document.activeElement?.closest('[role="article"]') ?? null) !==
			null,
	);
}

async function deliverVideo(page: Page): Promise<void> {
	const timestamp = Date.now() + 60_000;
	await emitMessageSent(page, {
		type: "Video",
		body: {
			mediaId: 900_002,
			url: "https://cdns.grindr.com/videos/chat/clip.mp4",
			contentType: "video/mp4",
			length: 8000,
			maxViews: 2,
			viewsRemaining: 2,
			looping: false,
		},
		messageId: `ws-video-${timestamp}`,
		conversationId: DEMO_CONVERSATION_ID,
		senderId: THEM,
		timestamp,
		unsent: false,
		reactions: [],
		replyToMessage: null,
	});
	await page.getByRole("button", PLAY_VIDEO).last().waitFor();
}

async function recordPreventedArrows(page: Page): Promise<void> {
	await page.evaluate(() => {
		window.__preventedArrows = [];
		window.addEventListener("keydown", (event) => {
			if (event.key.startsWith("Arrow"))
				window.__preventedArrows?.push(event.defaultPrevented);
		});
	});
}

test.describe("keyboard navigation in a conversation", () => {
	test("Tab from the nav bar lands on the newest message's menu button, and the next Tab leaves the messages", async ({
		page,
	}) => {
		await openConversation(page);

		await tabFromNavBar(page);

		const newest = actionsButtons(page).last();
		await expect(newest).toBeFocused();
		await expect(newest).toHaveAttribute("aria-haspopup", "menu");

		await page.keyboard.press("Tab");
		expect(await focusIsInAMessage(page)).toBe(false);

		await page.keyboard.press("Shift+Tab");
		await expect(newest).toBeFocused();
	});

	test("ArrowUp walks every message from the newest with a visible ring, and ArrowDown walks back", async ({
		page,
	}) => {
		await openConversation(page);
		const buttons = actionsButtons(page);
		const count = await buttons.count();

		const up = await arrowThrough(page, {
			start: buttons.last(),
			key: "ArrowUp",
			stops: count + 2,
		});
		expect(focusProblems(up)).toEqual([]);
		expect(up).toHaveLength(count);
		await expect(buttons.first()).toBeFocused();

		const down = await arrowThrough(page, {
			key: "ArrowDown",
			stops: count + 2,
		});
		expect(focusProblems(down)).toEqual([]);
		expect(down).toHaveLength(count);
		await expect(buttons.last()).toBeFocused();
	});

	test("only one control in the messages holds a Tab stop", async ({
		page,
	}) => {
		await openConversation(page);
		await deliverVideo(page);
		await actionsButtons(page).last().focus();
		await page.keyboard.press("ArrowUp");

		const stops = await page
			.locator(MESSAGES_SCROLLER)
			.evaluate(
				(scroller) =>
					[
						...scroller.querySelectorAll<HTMLElement>(
							"a[href], button",
						),
					].filter((element) => element.tabIndex >= 0).length,
			);
		expect(stops).toBe(1);
	});

	test("Left and Right step between a message's video and its menu button and never reach the swipe rail", async ({
		page,
	}) => {
		await openConversation(page);
		await deliverVideo(page);
		await recordPreventedArrows(page);
		const actions = actionsButtons(page).last();
		const play = page.getByRole("button", PLAY_VIDEO).last();
		await actions.focus();

		await page.keyboard.press("ArrowLeft");
		await expect(play).toBeFocused();

		await page.keyboard.press("ArrowLeft");
		await expect(play).toBeFocused();

		await page.keyboard.press("ArrowRight");
		await expect(actions).toBeFocused();

		await page.keyboard.press("ArrowRight");
		await expect(actions).toBeFocused();
		expect(await page.evaluate(() => window.__preventedArrows)).toEqual([
			true,
			true,
			true,
			true,
		]);
		await expect(page.getByText("Replying to")).toHaveCount(0);
	});

	test("moving to another message lands on its menu button even after visiting media", async ({
		page,
	}) => {
		await openConversation(page);
		await deliverVideo(page);
		const buttons = actionsButtons(page);
		await page.getByRole("button", PLAY_VIDEO).last().focus();

		await page.keyboard.press("ArrowUp");

		await expect(buttons.nth((await buttons.count()) - 2)).toBeFocused();
	});

	test("ArrowDown on the newest message offers the Refresh button below it", async ({
		page,
	}) => {
		await openConversation(page);
		await actionsButtons(page).last().focus();

		await page.keyboard.press("ArrowDown");

		await expect(actionsButtons(page).last()).toBeFocused();
		await expect(
			page.getByRole("button", { name: "Refresh" }),
		).toBeVisible();
	});

	test("deleting a message from its menu by keyboard hands focus to the message that takes its place", async ({
		page,
	}) => {
		await openConversation(page);
		const buttons = actionsButtons(page);
		const count = await buttons.count();
		const index = count - 3;
		const deleted = await buttons
			.nth(index)
			.evaluateHandle((button) => button.closest('[role="article"]'));
		await buttons.last().focus();
		await page.keyboard.press("ArrowUp");
		await page.keyboard.press("ArrowUp");
		await expect(buttons.nth(index)).toBeFocused();

		await page.keyboard.press("Enter");
		const deleteForMe = page.getByRole("menuitem", {
			name: "Delete for me",
		});
		await deleteForMe.focus();
		await page.keyboard.press("Enter");

		await expect
			.poll(() => deleted.evaluate((article) => article?.isConnected))
			.toBe(false);
		await expect(buttons).toHaveCount(count - 1);
		await expect(buttons.nth(index)).toBeFocused();
	});

	test("Tab lands on the newest message's menu button before the scroll to it has settled", async ({
		page,
	}) => {
		await page.addInitScript(() => {
			window.addEventListener(
				"scrollend",
				(event) => event.stopImmediatePropagation(),
				{ capture: true },
			);
		});
		await openConversation(page);

		await tabFromNavBar(page);

		await expect(actionsButtons(page).last()).toBeFocused();
	});
});

declare global {
	interface Window {
		__preventedArrows?: boolean[];
	}
}
