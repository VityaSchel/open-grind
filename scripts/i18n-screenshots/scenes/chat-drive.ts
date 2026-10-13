import type { Locator, Page } from "@playwright/test";

import { INCOMING_ROW, MESSAGE_ROW } from "../../../e2e/support/app";
import type { NativeError } from "../../../src/lib/demo/screenshot-scene";
import { conversationPath } from "./chat-fixtures";
import { holdToast, SHOWN_TOAST } from "./toast";
import { visit } from "./visit";

const INBOX_ROW = 'main a[href^="/chat/"]';
export const CONVERSATIONS_SCROLLER = '[data-slot="conversations-scroller"]';
export const MESSAGES_SCROLLER = '[data-slot="messages-scroller"]';
export const MESSAGE_MENU = 'dialog[open] [data-slot="context-menu-list"]';
const OUTGOING_ROW = `${MESSAGE_ROW}.ps-3`;
export const CONNECT_FAILED: NativeError = { kind: "Connect" };

const TOASTER = "ol[data-sonner-toaster]";
const WHEEL_DELTA = 40;

export function inboxRow({
	page,
	withId,
}: {
	page: Page;
	withId: number;
}): Locator {
	return page.locator(`main a[href="${conversationPath(withId)}"]`).first();
}

export function openInbox(page: Page): Promise<void> {
	return visit({ page, path: "/chat", ready: page.locator(INBOX_ROW) });
}

export function openConversation({
	page,
	withId,
}: {
	page: Page;
	withId: number;
}): Promise<void> {
	return visit({
		page,
		path: conversationPath(withId),
		ready: page.locator(MESSAGE_ROW),
	});
}

export function composerInput(page: Page): Locator {
	return page.locator('[data-slot="message-composer"] textarea');
}

export function lastIncoming(page: Page): Locator {
	return page.locator(INCOMING_ROW).last();
}

export function lastOutgoing(page: Page): Locator {
	return page.locator(OUTGOING_ROW).last();
}

export async function openMessageMenu(row: Locator): Promise<void> {
	await row
		.locator('[data-slot="message-bubble"]')
		.first()
		.click({ button: "right" });
	await row.page().locator(MESSAGE_MENU).waitFor();
}

export async function chooseFromMessageMenu({
	row,
	action,
}: {
	row: Locator;
	action: string;
}): Promise<void> {
	await openMessageMenu(row);
	const menu = row.page().locator(MESSAGE_MENU);
	await menu.getByRole("button", { name: action }).click();
	await menu.waitFor({ state: "hidden" });
}

export async function addingToast({
	page,
	action,
}: {
	page: Page;
	action: () => Promise<void>;
}): Promise<void> {
	const shown = await page.locator(SHOWN_TOAST).count();
	await action();
	await page.locator(SHOWN_TOAST).nth(shown).waitFor();
	await pauseToasts(page);
	await holdToast(page);
}

export async function toastsShown({
	page,
	count,
}: {
	page: Page;
	count: number;
}): Promise<void> {
	await page.locator(SHOWN_TOAST).first().waitFor();
	await pauseToasts(page);
	await page
		.locator(SHOWN_TOAST)
		.nth(count - 1)
		.waitFor();
	await holdToast(page);
}

export async function pauseToasts(page: Page): Promise<void> {
	await page.locator(TOASTER).first().dispatchEvent("pointerdown");
}

export async function revealRefreshButton({
	page,
	scroller,
	towardTop,
}: {
	page: Page;
	scroller: string;
	towardTop: boolean;
}): Promise<Locator> {
	await page
		.locator(scroller)
		.dispatchEvent("wheel", {
			deltaY: towardTop ? -WHEEL_DELTA : WHEEL_DELTA,
		});
	const button = page.getByRole("button", { name: "Refresh" });
	await button.waitFor();
	return button;
}

export async function scrollToTop({
	page,
	scroller,
}: {
	page: Page;
	scroller: string;
}): Promise<void> {
	await page.locator(scroller).evaluate((element) => {
		element.scrollTo({ top: 0, behavior: "instant" });
	});
}

export async function scrollToBottom({
	page,
	scroller,
}: {
	page: Page;
	scroller: string;
}): Promise<void> {
	await page.locator(scroller).evaluate((element) => {
		element.scrollTo({ top: element.scrollHeight, behavior: "instant" });
	});
}

export async function failRandomUuids(page: Page): Promise<void> {
	await page.evaluate(() => {
		crypto.randomUUID = () => {
			throw new Error("No random identifiers are available");
		};
	});
}
