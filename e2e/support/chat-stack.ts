import { expect, type Page } from "@playwright/test";

import {
	FIRST_ROUTE_COMPILE_MS,
	installEventInjection,
	installTauriShim,
} from "./app";
import { LIVE_STACK } from "./stack-layers";

export const WIDE = { width: 1024, height: 800 };
export const SHEET = LIVE_STACK.sheet;
export const base = (page: Page) => page.locator(LIVE_STACK.base);
export const sheet = (page: Page) => page.locator(SHEET);
export const dim = (page: Page) => page.locator(LIVE_STACK.dim);
export const listScroller = (page: Page) =>
	page.locator('[data-slot="conversations-scroller"]');
export const rows = (page: Page) => page.locator('a[href^="/chat/"]:visible');
export const row = (page: Page, { href }: { href: string }) =>
	page.locator(`a[href="${href}"]:visible`);
export const backToChats = (page: Page) =>
	page.getByRole("link", { name: "Back to chats" });

export async function openInbox(
	page: Page,
	{ platform = "macos", injectEvents = false } = {},
) {
	await installTauriShim(page, { platform });
	if (injectEvents) await installEventInjection(page);
	await page.goto("/chat");
	await rows(page).nth(1).waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });
}

export async function openConversation(
	page: Page,
	{ href }: { href?: string } = {},
) {
	const target = href ?? (await rows(page).nth(1).getAttribute("href"));
	await row(page, { href: target! }).click();
	await expect(page).toHaveURL(new RegExp(`${target}$`));
	await expect(dim(page)).toHaveCount(0, { timeout: 5_000 });
	return target;
}
