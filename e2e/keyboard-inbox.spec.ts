import { expect, type Locator, type Page, test } from "@playwright/test";

import {
	DEMO_CONVERSATION,
	DEMO_CONVERSATION_ID,
	FIRST_ROUTE_COMPILE_MS,
	installTauriShim,
	pathname,
} from "./support/app";
import {
	arrowThrough,
	focusProblems,
	measureFocusedElement,
} from "./support/focus";

const DESKTOP = { width: 1280, height: 800 };
const SCROLLER = '[data-slot="conversations-scroller"]';
const CONVERSATION_LINK = '[data-slot="profile-item-link"]';
const PROFILE_LINK = '[data-slot="profile-item-avatar-link"]';
const SELECTION_TOGGLE = '[data-slot="profile-item-selection-toggle"]';
const MAX_TAB_PRESSES = 30;
const ME = 123456000;
const CONVERSATIONS_MODULE_URL =
	"/src/lib/chat/conversations-context.svelte.ts";
const LATER_CONVERSATIONS = 12;

function scroller(page: Page): Locator {
	return page.locator(SCROLLER);
}

function rows(page: Page): Locator {
	return scroller(page).locator('[data-slot="conversation-row"]');
}

function rowOf(
	page: Page,
	{ conversationId }: { conversationId: string },
): Locator {
	return rows(page).filter({
		has: page.locator(`a[href="/chat/${conversationId}"]`),
	});
}

async function conversationIdAt(
	page: Page,
	{ index }: { index: number },
): Promise<string> {
	const conversationId = await rows(page)
		.nth(index)
		.getAttribute("data-conversation-id");
	if (conversationId === null)
		throw new Error(`row ${index} has no conversation id`);
	return conversationId;
}

function conversationLinks(page: Page): Locator {
	return scroller(page).locator(`${CONVERSATION_LINK}:visible`);
}

async function openInbox(
	page: Page,
	{ path = "/chat" }: { path?: string } = {},
): Promise<void> {
	await installTauriShim(page);
	await page.goto(path);
	await conversationLinks(page)
		.first()
		.waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });
}

function focusIsInside(target: Locator): Promise<boolean> {
	return target.evaluate((node) => node.contains(document.activeElement));
}

async function tabIntoList(page: Page): Promise<void> {
	await page.evaluate(() =>
		(document.activeElement as HTMLElement | null)?.blur(),
	);
	for (let press = 0; press < MAX_TAB_PRESSES; press++) {
		await page.keyboard.press("Tab");
		if (await focusIsInside(scroller(page))) return;
	}
	throw new Error("Tab never reached the conversations list");
}

async function addLaterConversations(page: Page): Promise<string> {
	return page.evaluate(
		async ({ module, me, count }) => {
			const { getOrCreateConversationsState } = await import(module);
			const conversations = getOrCreateConversationsState(me);
			const template = conversations.entries.at(-1);
			let last = "";
			for (let copy = 1; copy <= count; copy++) {
				const later = JSON.parse(JSON.stringify(template)) as {
					data: { conversationId: string };
				};
				last = `${900000 + copy}:${me}`;
				later.data.conversationId = last;
				conversations.entries.push(later);
			}
			return last;
		},
		{
			module: CONVERSATIONS_MODULE_URL,
			me: ME,
			count: LATER_CONVERSATIONS,
		},
	);
}

test.describe("keyboard navigation in the inbox", () => {
	test("Tab enters the conversation list once, on the first conversation, and the next Tab leaves it", async ({
		page,
	}) => {
		await openInbox(page);
		const first = conversationLinks(page).first();

		await tabIntoList(page);
		await expect(first).toBeFocused();

		await page.keyboard.press("Tab");
		expect(await focusIsInside(scroller(page))).toBe(false);

		await page.keyboard.press("Shift+Tab");
		await expect(first).toBeFocused();
	});

	test("Shift+Tab from the list reaches the filter chips", async ({
		page,
	}) => {
		await openInbox(page);
		await tabIntoList(page);

		await page.keyboard.press("Shift+Tab");

		expect(
			await focusIsInside(
				page.getByRole("toolbar", { name: "Conversation filters" }),
			),
		).toBe(true);
	});

	test("ArrowDown walks every conversation with a visible ring, and ArrowUp walks back", async ({
		page,
	}) => {
		await openInbox(page);
		const links = conversationLinks(page);
		const count = await links.count();

		const down = await arrowThrough(page, {
			start: links.first(),
			key: "ArrowDown",
			stops: count + 2,
		});
		expect(focusProblems(down)).toEqual([]);
		expect(down).toHaveLength(count);
		await expect(links.last()).toBeFocused();

		const up = await arrowThrough(page, {
			key: "ArrowUp",
			stops: count + 2,
		});
		expect(focusProblems(up)).toEqual([]);
		expect(up).toHaveLength(count);
		await expect(links.first()).toBeFocused();
	});

	test("Left and Right step between a row's profile and conversation links, and Up and Down keep the column", async ({
		page,
	}) => {
		await openInbox(page);
		await conversationLinks(page).first().focus();

		await page.keyboard.press("ArrowLeft");
		await expect(rows(page).nth(0).locator(PROFILE_LINK)).toBeFocused();

		await page.keyboard.press("ArrowLeft");
		await expect(rows(page).nth(0).locator(PROFILE_LINK)).toBeFocused();

		await page.keyboard.press("ArrowDown");
		await expect(rows(page).nth(1).locator(PROFILE_LINK)).toBeFocused();

		await page.keyboard.press("ArrowRight");
		await expect(
			rows(page).nth(1).locator(`${CONVERSATION_LINK}:visible`),
		).toBeFocused();
		expect(await pathname(page)).toBe("/chat");
	});

	test("Home and End jump to the first and the last conversation", async ({
		page,
	}) => {
		await openInbox(page);
		const links = conversationLinks(page);
		await links.first().focus();

		await page.keyboard.press("End");
		await expect(links.last()).toBeFocused();

		await page.keyboard.press("Home");
		await expect(links.first()).toBeFocused();
	});

	test("End reaches conversations added after the list mounted and lands on the last one's link", async ({
		page,
	}) => {
		await openInbox(page);
		const lastId = await addLaterConversations(page);
		await conversationLinks(page).first().focus();

		await page.keyboard.press("End");

		await expect(
			rowOf(page, { conversationId: lastId }).locator(
				`${CONVERSATION_LINK}:visible`,
			),
		).toBeFocused();
		expect(
			focusProblems(await arrowThrough(page, { key: "End", stops: 1 })),
		).toEqual([]);
	});

	test("only one conversation row holds a Tab stop", async ({ page }) => {
		await openInbox(page);
		await conversationLinks(page).nth(2).focus();
		await page.keyboard.press("ArrowDown");

		const stops = await scroller(page).evaluate(
			(node) =>
				[
					...node.querySelectorAll<HTMLElement>("a[href], button"),
				].filter((element) => element.tabIndex >= 0).length,
		);
		expect(stops).toBe(1);
	});

	test("the context menu key enters selection mode on the row's toggle, arrows move between toggles, and Escape leaves it on the conversation link", async ({
		page,
	}) => {
		await openInbox(page);
		await conversationLinks(page).first().focus();

		await page.keyboard.press("ContextMenu");

		const exit = page.getByRole("button", { name: "Exit selection" });
		await expect(exit).toBeVisible();
		const firstToggle = rows(page).nth(0).locator(SELECTION_TOGGLE);
		await expect(firstToggle).toBeFocused();
		await expect(firstToggle).toHaveAttribute("aria-pressed", "true");

		await page.keyboard.press("ArrowDown");
		await expect(rows(page).nth(1).locator(SELECTION_TOGGLE)).toBeFocused();
		await expect(
			rows(page).nth(1).locator(SELECTION_TOGGLE),
		).toHaveAttribute("aria-pressed", "false");

		await page.keyboard.press("Escape");

		await expect(exit).toBeHidden();
		await expect(
			rows(page).nth(1).locator(`${CONVERSATION_LINK}:visible`),
		).toBeFocused();
		expect(await pathname(page)).toBe("/chat");
	});

	test("Escape leaves selection mode even when focus sat on the selection bar", async ({
		page,
	}) => {
		await openInbox(page);
		await conversationLinks(page).first().focus();
		await page.keyboard.press("ContextMenu");
		const exit = page.getByRole("button", { name: "Exit selection" });
		await exit.focus();

		await page.keyboard.press("Escape");

		await expect(exit).toBeHidden();
		await expect(conversationLinks(page).first()).toBeFocused();
	});

	test("a touch long-press on another row enters selection mode without moving keyboard focus", async ({
		page,
	}) => {
		await openInbox(page);
		await tabIntoList(page);
		const keyboardFocused = conversationLinks(page).first();
		await expect(keyboardFocused).toBeFocused();
		const pressed = rows(page)
			.nth(2)
			.locator(`${CONVERSATION_LINK}:visible`);
		const touch = { pointerType: "touch", isPrimary: true, pointerId: 7 };

		await pressed.dispatchEvent("pointerdown", touch);
		const exit = page.getByRole("button", { name: "Exit selection" });
		await expect(exit).toBeVisible();
		await pressed.dispatchEvent("pointerup", touch);

		await expect(
			rows(page).nth(2).locator(SELECTION_TOGGLE),
		).toHaveAttribute("aria-pressed", "true");
		await expect(keyboardFocused).toBeFocused();
	});

	test("Exit selection pressed from the keyboard returns focus to the row's conversation link", async ({
		page,
	}) => {
		await openInbox(page);
		await conversationLinks(page).nth(1).focus();
		await page.keyboard.press("ContextMenu");
		const exit = page.getByRole("button", { name: "Exit selection" });
		await exit.focus();

		await page.keyboard.press("Enter");

		await expect(exit).toBeHidden();
		await expect(
			rows(page).nth(1).locator(`${CONVERSATION_LINK}:visible`),
		).toBeFocused();
	});

	test("pinning from the selection bar by keyboard keeps focus on the pinned row's conversation link", async ({
		page,
	}) => {
		await openInbox(page);
		const pinnedId = await conversationIdAt(page, { index: 2 });
		await conversationLinks(page).nth(2).focus();
		await page.keyboard.press("ContextMenu");
		const pin = page.getByRole("button", { name: "Pin selected" });
		await pin.focus();

		await page.keyboard.press("Enter");

		await expect(pin).toBeHidden();
		await expect(
			rowOf(page, { conversationId: pinnedId }).locator(
				`${CONVERSATION_LINK}:visible`,
			),
		).toBeFocused();
	});

	test("deleting conversations from selection mode by keyboard hands focus to the row that takes their place", async ({
		page,
	}) => {
		await openInbox(page);
		const deletedId = await conversationIdAt(page, { index: 1 });
		const nextId = await conversationIdAt(page, { index: 2 });
		await conversationLinks(page).nth(1).focus();
		await page.keyboard.press("ContextMenu");
		await page.getByRole("button", { name: "Delete selected" }).focus();
		await page.keyboard.press("Enter");
		await expect(
			page.getByRole("button", { name: "Cancel" }),
		).toBeFocused();
		await page.keyboard.press("Tab");

		await page.keyboard.press("Enter");

		await expect(rowOf(page, { conversationId: deletedId })).toHaveCount(0);
		await expect(
			rowOf(page, { conversationId: nextId }).locator(
				`${CONVERSATION_LINK}:visible`,
			),
		).toBeFocused();
	});

	test.describe("beside an open conversation", () => {
		test.use({ viewport: DESKTOP });

		test("deleting a conversation from its context menu by keyboard hands focus to the row that takes its place", async ({
			page,
		}) => {
			await openInbox(page);
			const deletedId = await conversationIdAt(page, { index: 2 });
			const nextId = await conversationIdAt(page, { index: 3 });
			await conversationLinks(page).nth(2).focus();
			await page.keyboard.press("ContextMenu");
			await page.getByRole("menuitem", { name: "Delete" }).focus();
			await page.keyboard.press("Enter");
			await expect(
				page.getByRole("button", { name: "Cancel" }),
			).toBeFocused();
			await page.keyboard.press("Tab");

			await page.keyboard.press("Enter");

			await expect(
				rowOf(page, { conversationId: deletedId }),
			).toHaveCount(0);
			await expect(page.getByRole("alertdialog")).toHaveCount(0);
			const neighbor = rowOf(page, { conversationId: nextId }).locator(
				`${CONVERSATION_LINK}:visible`,
			);
			await expect(neighbor).toBeFocused();
			const measured = await page.evaluate(measureFocusedElement);
			expect(focusProblems(measured ? [measured.stop] : [])).toEqual([]);
			expect(measured).not.toBeNull();
		});

		test("deleting the open conversation by keyboard leaves focus on the row that takes its place", async ({
			page,
		}) => {
			await openInbox(page, { path: DEMO_CONVERSATION });
			const keys = await rows(page).evaluateAll((elements) =>
				elements.map((row) => row.getAttribute("data-conversation-id")),
			);
			const nextId = keys[keys.indexOf(DEMO_CONVERSATION_ID) + 1]!;
			await rowOf(page, { conversationId: DEMO_CONVERSATION_ID })
				.locator(`${CONVERSATION_LINK}:visible`)
				.focus();
			await page.keyboard.press("ContextMenu");
			await page.getByRole("menuitem", { name: "Delete" }).focus();
			await page.keyboard.press("Enter");
			await expect(
				page.getByRole("button", { name: "Cancel" }),
			).toBeFocused();
			await page.keyboard.press("Tab");

			await page.keyboard.press("Enter");

			await expect(page).toHaveURL(/\/chat$/);
			await expect(
				rowOf(page, { conversationId: nextId }).locator(
					`${CONVERSATION_LINK}:visible`,
				),
			).toBeFocused();
		});

		test("Tab into the list lands on the open conversation, and the next Tab leaves the list", async ({
			page,
		}) => {
			await openInbox(page, { path: DEMO_CONVERSATION });

			await tabIntoList(page);

			await expect(
				rowOf(page, { conversationId: DEMO_CONVERSATION_ID }).locator(
					`${CONVERSATION_LINK}:visible`,
				),
			).toBeFocused();

			await page.keyboard.press("Tab");
			expect(await focusIsInside(scroller(page))).toBe(false);
		});
	});
});
