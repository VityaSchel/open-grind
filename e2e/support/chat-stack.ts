import { expect, type Page } from "@playwright/test";

import type { SupportedPlatform } from "../../src/lib/platform/os";
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
	{
		platform,
		injectEvents = false,
	}: { platform: SupportedPlatform; injectEvents?: boolean },
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

export async function openInboxFromHome(
	page: Page,
	{ platform }: { platform: SupportedPlatform },
) {
	await page.setViewportSize(WIDE);
	await installTauriShim(page, { platform });
	await page.goto("/");
	await page
		.getByRole("link", { name: "Inbox", exact: true })
		.click({ timeout: FIRST_ROUTE_COMPILE_MS });
	await expect(page).toHaveURL(/\/chat$/);
	await rows(page).nth(3).waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });
}

async function openHref(page: Page, { href }: { href: string }) {
	await row(page, { href }).click();
	await expect(page).toHaveURL(new RegExp(`${href}$`));
}

export async function openRow(page: Page, { nth }: { nth: number }) {
	const href = (await rows(page).nth(nth).getAttribute("href"))!;
	await openHref(page, { href });
	return href;
}

export async function openRows(page: Page, { count }: { count: number }) {
	const hrefs = await rows(page).evaluateAll(
		(links, count) =>
			links.slice(1, count + 1).map((link) => link.getAttribute("href")!),
		count,
	);
	for (const href of hrefs) await openHref(page, { href });
	return hrefs;
}

export async function deleteFromList(page: Page, { href }: { href: string }) {
	await row(page, { href }).click({ button: "right" });
	await page.getByRole("menuitem", { name: "Delete" }).click();
	await page.getByRole("button", { name: "Delete", exact: true }).click();
	await expect(row(page, { href })).toHaveCount(0);
}

type Frame = { base: number; sheet: number | null; path: string };

export function recordFrames(page: Page): Promise<Frame[]> {
	return page.evaluate(
		() =>
			new Promise<Frame[]>((resolve) => {
				const frames: Frame[] = [];
				const x = (slot: string) => {
					const pane = document.querySelector(
						`[data-slot="live-stack-${slot}"]`,
					);
					return pane
						? new DOMMatrix(getComputedStyle(pane).transform).m41
						: null;
				};
				const started = performance.now();
				const sample = () => {
					frames.push({
						base: x("base") ?? 0,
						sheet: x("sheet"),
						path: location.pathname,
					});
					if (performance.now() - started < 2000)
						requestAnimationFrame(sample);
					else resolve(frames);
				};
				requestAnimationFrame(sample);
			}),
	);
}
