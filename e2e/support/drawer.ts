import { expect, type Page } from "@playwright/test";

import { DEMO_CONVERSATION, installTauriShim } from "./app";

export const DRAWER = "[data-vaul-drawer]";
const PANEL = "[data-slot=sheet-panel]";

export const MEDIA_TILE = '[data-slot="media-tile"]';
export const ALBUM_TILE = '[data-slot="album-tile"]';
export const SELECTED_MEDIA_TILE = `${MEDIA_TILE}[aria-pressed="true"]`;
export const SELECTABLE_MEDIA_TILE = `${MEDIA_TILE}[aria-pressed="false"]`;
export const SELECTED_ALBUM_TILE = `${ALBUM_TILE}[aria-pressed="true"]`;
export const SHARED_ALBUM_TILE = `${ALBUM_TILE}:has([data-slot="album-shared-badge"])`;
export const UNSHARED_ALBUM_TILE = `${ALBUM_TILE}:not(:has([data-slot="album-shared-badge"])):not(:has([data-slot="album-locked"]))`;

export interface DrawerBox {
	top: number;
	sheetScrollTop: number;
	expandRange: number;
	gridScrollTop: number;
	gridScrollable: boolean;
	tabListBottom: number;
	viewport: number;
	safeBottom: number;
}

export async function openAttachments(page: Page): Promise<void> {
	await installTauriShim(page);
	await page.goto(DEMO_CONVERSATION);
	const paperclip = page.getByRole("button", { name: "Add attachment" });
	await paperclip.waitFor({ timeout: 30_000 });
	await page.waitForTimeout(600);
	await paperclip.click();
	await page.locator(DRAWER).waitFor({ timeout: 10_000 });
	await page.waitForTimeout(900);
	await page.evaluate((panel) => {
		const el = document.querySelector<HTMLElement>(panel);
		if (el) el.style.minHeight = "2400px";
	}, PANEL);
	await page.waitForTimeout(100);
}

export function drawerBox(page: Page): Promise<DrawerBox | null> {
	return page.evaluate(() => {
		const drawer =
			document.querySelector<HTMLElement>("[data-vaul-drawer]");
		if (!drawer) return null;
		const panel = drawer.querySelector<HTMLElement>(
			"[data-slot=sheet-panel]",
		);
		const scroller = drawer.querySelector<HTMLElement>(
			"[data-slot=sheet-scroller]",
		);
		const peek = drawer.querySelector<HTMLElement>(
			"[data-slot=sheet-peek]",
		);
		const tabList = drawer.querySelector<HTMLElement>(
			"[data-slot=tabs-list]",
		);
		const range = peek?.offsetHeight ?? 0;
		const scrolled = scroller?.scrollTop ?? 0;
		return {
			top: Math.round(panel?.getBoundingClientRect().top ?? 0),
			sheetScrollTop: Math.round(scrolled),
			expandRange: Math.round(range),
			gridScrollTop: Math.round(Math.max(0, scrolled - range)),
			gridScrollable: scroller
				? scroller.scrollHeight > scroller.clientHeight + range + 1
				: false,
			tabListBottom: Math.round(
				tabList?.getBoundingClientRect().bottom ?? 0,
			),
			viewport: window.innerHeight,
			safeBottom: parseFloat(getComputedStyle(drawer).marginBottom) || 0,
		};
	});
}

export async function box(page: Page): Promise<DrawerBox> {
	const value = await drawerBox(page);
	expect(value, "the drawer should still be open").not.toBeNull();
	return value!;
}

export async function snapTops(page: Page) {
	return page.evaluate(() => {
		const peek = document.querySelector<HTMLElement>(
			"[data-slot=sheet-peek]",
		);
		const scroller = document.querySelector<HTMLElement>(
			"[data-slot=sheet-scroller]",
		);
		const range = peek?.offsetHeight ?? 0;
		const fullTop = scroller?.getBoundingClientRect().top ?? 0;
		return {
			full: Math.round(fullTop),
			short: Math.round(fullTop + range),
			viewport: window.innerHeight,
		};
	});
}

export async function expandToFull(page: Page): Promise<void> {
	const { full } = await snapTops(page);
	const b = await box(page);
	const at = { x: 210, y: b.top + 160 };
	for (let i = 0; i < 14; i++) {
		await page.mouse.move(at.x, at.y);
		await page.mouse.wheel(0, 90);
		await page.waitForTimeout(16);
	}
	await page.waitForTimeout(700);
	await expect
		.poll(async () => (await box(page)).top, { timeout: 5000 })
		.toBeLessThanOrEqual(full + 4);
	await page.evaluate(() => {
		const scroller = document.querySelector<HTMLElement>(
			"[data-slot=sheet-scroller]",
		);
		const peek = document.querySelector<HTMLElement>(
			"[data-slot=sheet-peek]",
		);
		if (scroller && peek) scroller.scrollTop = peek.offsetHeight;
	});
	await page.waitForTimeout(200);
}
