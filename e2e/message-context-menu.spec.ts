import { expect, type Locator, type Page, test } from "@playwright/test";

import {
	afterTwoFrames,
	installEventInjection,
	installTauriShim,
} from "./support/app";

const CONVERSATION = "/chat/100001:123456000";
const CONVERSATION_ID = "100001:123456000";
const ME = 123456000;
const THEM = 100001;
const THREAD_BUBBLE = '[data-slot="message"] [data-slot="message-bubble"]';
const LIFTED_BUBBLE = 'dialog[open] [data-slot="message-bubble"]';
const MENU_LIST = 'dialog[open] [data-slot="context-menu-list"]';
const ROOM_BELOW_HELD_MESSAGE_PX = 178;
const LONG_TEXT = Array.from(
	{ length: 6 },
	() => "Lorem ipsum dolor sit amet, consectetur adipiscing elit.",
).join(" ");

test("right-clicking a message opens its context menu", async ({ page }) => {
	await installTauriShim(page);
	await page.goto(CONVERSATION);

	const bubble = page.getByText("Hey! Lorem ipsum dolor sit amet.").first();
	await bubble.waitFor();

	await bubble.click({ button: "right" });

	await expect(
		page.getByRole("button", { name: "Copy message" }),
	).toBeVisible();
});

let messageCount = 0;

async function deliver(
	page: Page,
	{ text, senderId }: { text: string; senderId: number },
): Promise<Locator> {
	const timestamp = Date.now() + 60_000 + messageCount++;
	await page.evaluate(
		(payload) => {
			window.__emitTauriEvent?.("grindr:chat_v1_message_sent", {
				type: "chat.v1.message_sent",
				notificationId: null,
				ref: null,
				payload,
			});
		},
		{
			type: "Text",
			body: { text },
			messageId: `ws-${timestamp}`,
			conversationId: CONVERSATION_ID,
			senderId,
			timestamp,
			unsent: false,
			reactions: [],
			replyToMessage: null,
		},
	);
	const bubble = page.locator(THREAD_BUBBLE, { hasText: text });
	await bubble.waitFor();
	return bubble;
}

async function openConversation(
	page: Page,
	viewport: { width: number; height: number },
): Promise<void> {
	await page.setViewportSize(viewport);
	await installTauriShim(page);
	await installEventInjection(page);
	await page.goto(CONVERSATION);
	await page.locator(THREAD_BUBBLE).first().waitFor({ timeout: 60_000 });
}

async function openMenuOn(bubble: Locator): Promise<void> {
	const page = bubble.page();
	await page.waitForTimeout(1000);
	await bubble.click({ button: "right" });
	await page.locator(MENU_LIST).waitFor();
	await afterTwoFrames(page);
}

function topOf(target: Locator): Promise<number> {
	return target.evaluate((node) => node.getBoundingClientRect().top);
}

function gapBetween(page: Page, a: string, b: string): Promise<number> {
	return page.evaluate(
		([first, second]) => {
			const p = document.querySelector(first)!.getBoundingClientRect();
			const q = document.querySelector(second)!.getBoundingClientRect();
			return Math.hypot(
				Math.max(0, p.left - q.right, q.left - p.right),
				Math.max(0, p.top - q.bottom, q.top - p.bottom),
			);
		},
		[a, b] as const,
	);
}

test("a message's context menu stays on it when the soft keyboard closes", async ({
	page,
}) => {
	await openConversation(page, { width: 420, height: 480 });
	const sent = await deliver(page, {
		text: "Held while typing",
		senderId: ME,
	});
	await openMenuOn(sent);
	const topWithKeyboard = await topOf(sent);

	await page.setViewportSize({ width: 420, height: 800 });
	await afterTwoFrames(page);

	expect(
		await page.locator("dialog[open]").count(),
		"the menu should survive the keyboard closing",
	).toBe(1);
	await expect
		.poll(async () => (await topOf(sent)) - topWithKeyboard, {
			message: "the message should move down into the freed space",
		})
		.toBeGreaterThan(100);
	await expect
		.poll(
			async () =>
				Math.abs(
					(await topOf(page.locator(LIFTED_BUBBLE))) -
						(await topOf(sent)),
				),
			{ message: "the lifted copy should follow the message" },
		)
		.toBeLessThanOrEqual(2);
	await expect
		.poll(() => gapBetween(page, MENU_LIST, LIFTED_BUBBLE), {
			message: "the menu should stay beside the lifted copy",
		})
		.toBeLessThanOrEqual(12);
	await expect(
		page.getByRole("button", { name: "Copy message" }),
	).toBeInViewport({ ratio: 1 });
});

test("a message arriving under an open context menu leaves the menu in place", async ({
	page,
}) => {
	await openConversation(page, { width: 420, height: 800 });
	const sent = await deliver(page, { text: "Ours", senderId: ME });
	await openMenuOn(sent);
	const copy = page.getByRole("button", { name: "Copy message" });
	const copyTop = await topOf(copy);

	await deliver(page, { text: LONG_TEXT, senderId: THEM });
	await page.waitForTimeout(1000);

	expect(await topOf(copy), "the menu should not move under the finger").toBe(
		copyTop,
	);
});

async function openMenuNearBottom(page: Page): Promise<void> {
	await openConversation(page, { width: 420, height: 800 });
	const held = await deliver(page, { text: LONG_TEXT, senderId: THEM });
	await deliver(page, { text: "One", senderId: ME });
	await deliver(page, { text: "Two", senderId: ME });
	await deliver(page, { text: "Three", senderId: ME });
	await page.waitForTimeout(1000);
	await held.evaluate((bubble, roomBelow) => {
		const scroller = bubble.closest<HTMLElement>(
			'[data-slot="messages-scroller"]',
		)!;
		scroller.scrollTop -=
			innerHeight - roomBelow - bubble.getBoundingClientRect().bottom;
	}, ROOM_BELOW_HELD_MESSAGE_PX);
	await openMenuOn(held);
}

function systemBarOverlap(page: Page): Promise<number> {
	return page.locator(MENU_LIST).evaluate((list) => {
		const rootStyle = getComputedStyle(document.documentElement);
		const inset = (side: string) =>
			parseFloat(rootStyle.getPropertyValue(`--safe-area-${side}`)) || 0;
		const box = list.getBoundingClientRect();
		return Math.max(
			0,
			inset("top") - box.top,
			box.bottom - (innerHeight - inset("bottom")),
		);
	});
}

test("a context menu opened near the bottom stays clear of the system bars", async ({
	page,
}) => {
	await openMenuNearBottom(page);

	expect(await systemBarOverlap(page)).toBe(0);
});

test("the newest message's context menu stays clear of the navigation bar", async ({
	page,
}) => {
	await openConversation(page, { width: 420, height: 800 });
	await openMenuOn(await deliver(page, { text: "Newest", senderId: ME }));

	expect(await systemBarOverlap(page)).toBe(0);
});

test("a message taller than the screen keeps its whole context menu in reach", async ({
	page,
}) => {
	await openConversation(page, { width: 420, height: 800 });
	await openMenuOn(
		await deliver(page, {
			text: Array.from({ length: 6 }, () => LONG_TEXT).join(" "),
			senderId: THEM,
		}),
	);

	expect(await systemBarOverlap(page)).toBe(0);
	await expect(
		page.getByRole("button", { name: "Delete for me" }),
	).toBeInViewport({ ratio: 1 });
});

test("a context menu near the bottom keeps one placement while the viewport settles", async ({
	page,
}) => {
	await openMenuNearBottom(page);

	const moves = await page.locator(MENU_LIST).evaluate(
		(list) =>
			new Promise<number>((resolve) => {
				let count = 0;
				const observer = new MutationObserver(() => count++);
				observer.observe(list, { attributeFilter: ["style"] });
				window.dispatchEvent(new Event("resize"));
				setTimeout(() => {
					observer.disconnect();
					resolve(count);
				}, 800);
			}),
	);

	expect(moves, "the menu should not jump between sides").toBe(0);
});
