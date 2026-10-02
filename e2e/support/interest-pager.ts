import type { Page } from "@playwright/test";

import { installTauriShim, TrustedTouch } from "./app";

export const TAPS = "/interest/taps";
export const PAGER = '[data-slot="interest-pager"]';
export const TAPS_PANE = '[data-slot="interest-pane-taps"]';
export const VIEWS_SCROLLER = '[data-slot="views-scroller"]';
export const TAPS_SCROLLER = '[data-slot="taps-scroller"]';
export const LIST_SCROLLERS = [VIEWS_SCROLLER, TAPS_SCROLLER];

export async function openTaps(page: Page): Promise<void> {
	await installTauriShim(page);
	await page.goto(TAPS);
	await page
		.locator('a[href^="/profile/"]')
		.first()
		.waitFor({ timeout: 180_000 });
}

export async function swipeAcross(
	page: Page,
	{ distancePx, release = true }: { distancePx: number; release?: boolean },
) {
	const box = (await page
		.locator(LIST_SCROLLERS.join())
		.first()
		.boundingBox())!;
	const touch = await TrustedTouch.attach(page);
	await touch.drag(
		page,
		{ x: box.x + box.width * 0.3, y: box.y + box.height / 2 },
		{ x: box.x + box.width * 0.3 + distancePx, y: box.y + box.height / 2 },
		{ steps: 16, holdMs: 16, release },
	);
	return touch;
}

export function listScrollbars(page: Page) {
	return page.evaluate(
		(scrollers) =>
			scrollers.map((selector) => {
				const scroller = document.querySelector(selector);
				return (
					scroller && {
						scrollbarWidth:
							getComputedStyle(scroller).scrollbarWidth,
						contentWidth: scroller.clientWidth,
					}
				);
			}),
		LIST_SCROLLERS,
	);
}
