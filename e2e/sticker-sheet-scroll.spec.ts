import { expect, test } from "@playwright/test";

import {
	DRAWER,
	expandToFull,
	scrollSheetTo,
	SHEET_SCROLLER,
} from "./support/drawer";
import {
	gifTiles,
	openGaymoji,
	openStickers,
	showGaymojiTab,
	STICKER_TILE,
	stickersTab,
} from "./support/stickers";

test("each tab keeps its own place in the expanded sheet", async ({ page }) => {
	await openStickers(page);
	const scroller = page.locator(DRAWER).locator(SHEET_SCROLLER);
	const peek = await page
		.locator(DRAWER)
		.locator('[data-slot="sheet-peek"]')
		.evaluate((element: HTMLElement) => element.offsetHeight);
	const contentTop = () =>
		scroller.evaluate(
			(element, peekHeight) => element.scrollTop - peekHeight,
			peek,
		);
	await scrollSheetTo(page, { top: peek + 900 });

	await showGaymojiTab(page);
	await expect.poll(contentTop).toBeLessThanOrEqual(1);

	await stickersTab(page, { name: "GIFs" }).click();
	await expect(gifTiles(page).first()).toBeAttached();
	await expect.poll(contentTop).toBeGreaterThan(899);
});

test("a tile focused from the keyboard scrolls clear of the tab bar", async ({
	page,
}) => {
	await openGaymoji(page);
	await expandToFull(page);

	const clearance = await page.evaluate(
		({ drawer, tile }) => {
			const bar = document
				.querySelector(drawer)!
				.querySelector('[data-slot="media-sheet-tab-bar"]')!
				.getBoundingClientRect();
			const underBar = [
				...document.querySelector(drawer)!.querySelectorAll(tile),
			].find((each) => each.getBoundingClientRect().bottom > bar.top);
			if (!(underBar instanceof HTMLElement))
				throw new Error("no tile reaches under the tab bar");
			underBar.focus();
			return bar.top - underBar.getBoundingClientRect().bottom;
		},
		{ drawer: DRAWER, tile: STICKER_TILE },
	);

	expect(clearance).toBeGreaterThanOrEqual(0);
});
