import { expect, type Page, test } from "@playwright/test";

import { installEventInjection, installTauriShim } from "./support/app";

const CONVERSATION = "/chat/100001:123456000";
const CONVERSATION_ID = "100001:123456000";
const THEM = 100001;
const MESSAGE_ROW = '[role="button"][tabindex="0"]';
const MESSAGE = '[data-slot="message"]';
const SCROLLER = '[data-slot="messages-scroller"]';
const SCROLL_DOWN = '[aria-label="Scroll to newest messages"]';
const BADGE = `${SCROLL_DOWN} + [data-slot="badge"]`;

function peerText(timestamp: number) {
	return {
		type: "Text",
		body: { text: `late arrival ${timestamp}` },
		messageId: `ws-in-${timestamp}`,
		conversationId: CONVERSATION_ID,
		senderId: THEM,
		timestamp,
		unsent: false,
		reactions: [],
		replyToMessage: null,
	};
}

async function receiveMessage(page: Page, message: unknown): Promise<void> {
	await page.evaluate((payload) => {
		window.__emitTauriEvent?.("grindr:chat_v1_message_sent", {
			type: "chat.v1.message_sent",
			notificationId: null,
			ref: null,
			payload,
		});
	}, message);
}

async function scrollAwayFromFloor(page: Page): Promise<void> {
	await page.locator(SCROLLER).evaluate((el) => {
		el.scrollTop = 0;
	});
	await expect(page.locator(SCROLL_DOWN)).toBeVisible();
}

// A message counts as seen, and gets a read receipt, the moment its
// IntersectionObserver reports it. That observer roots itself at the nearest
// scrolling ancestor, so any scroller wrapped around a message silently
// becomes the frame it is judged against — and a message the reader never
// reached would report itself read.
test("a message is judged visible against the conversation, not a box of its own", async ({
	page,
}) => {
	await installTauriShim(page);
	await page.goto(CONVERSATION);
	await page.locator(MESSAGE_ROW).first().waitFor({ timeout: 60_000 });

	const rooting = await page.evaluate(
		({ message, scroller }) => {
			const scrolls = (el: Element) => {
				const { overflowY } = getComputedStyle(el);
				return overflowY === "auto" || overflowY === "scroll";
			};
			return [...document.querySelectorAll(message)].map((observed) => {
				let el = observed.parentElement;
				while (el && !scrolls(el)) el = el.parentElement;
				return {
					rootedAtScroller: el?.matches(scroller) ?? false,
					rootTag: el
						? `${el.tagName.toLowerCase()}.${el.className}`
						: "none",
				};
			});
		},
		{ message: MESSAGE, scroller: SCROLLER },
	);

	expect(rooting.length).toBeGreaterThan(0);
	for (const { rootedAtScroller, rootTag } of rooting) {
		expect(
			rootedAtScroller,
			`a message is measured against ${rootTag} instead of the conversation scroller`,
		).toBe(true);
	}
});

test("a message arriving while scrolled away badges the scroll-down button until the floor is revisited", async ({
	page,
}) => {
	await installTauriShim(page);
	await installEventInjection(page);
	await page.goto(CONVERSATION);
	await page.locator(MESSAGE_ROW).first().waitFor({ timeout: 60_000 });

	await scrollAwayFromFloor(page);
	await expect(page.locator(BADGE)).toHaveCount(0);

	await receiveMessage(page, peerText(Date.now()));
	await expect(page.locator(BADGE)).toHaveText("1");

	await page.locator(SCROLL_DOWN).click();
	await expect(page.locator(SCROLL_DOWN)).toBeHidden();

	await scrollAwayFromFloor(page);
	await expect(page.locator(BADGE)).toHaveCount(0);
});
