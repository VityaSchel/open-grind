import { expect, type Page } from "@playwright/test";

import {
	afterTwoFrames,
	FIRST_ROUTE_COMPILE_MS,
	installTauriShim,
	TrustedTouch,
} from "./app";

export const TAPS = "/interest/taps";
export const VIEWS = "/interest/views";
export const TAP_ROW = 'a[href^="/profile/"]';
export const PAGER = '[data-slot="interest-pager"]';
export const VIEWS_PANE = '[data-slot="interest-pane-views"]';
export const TAPS_PANE = '[data-slot="interest-pane-taps"]';
export const CHIP = '[data-slot="interest-tab-chip"]';
export const VIEWS_SCROLLER = '[data-slot="views-scroller"]';
export const TAPS_SCROLLER = '[data-slot="taps-scroller"]';
export const LIST_SCROLLERS = [VIEWS_SCROLLER, TAPS_SCROLLER];

type GlideFrame = {
	progress: number;
	locked: (string | undefined)[];
	chipLeft: number;
	chipAnimated: boolean;
	path: string;
};

declare global {
	interface Window {
		__glideFrames?: GlideFrame[];
	}
}

export async function openTaps(
	page: Page,
	{ platform }: { platform?: string } = {},
): Promise<void> {
	await installTauriShim(page, { platform });
	await page.goto(TAPS);
	await page
		.locator(TAP_ROW)
		.first()
		.waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });
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

export async function tabTrack(page: Page) {
	const left = async (name: string) =>
		(await page.getByRole("link", { name }).boundingBox())!.x;
	const views = await left("Views");
	return { views, span: (await left("Taps")) - views };
}

export async function glideToViews(page: Page) {
	await page.evaluate(
		([pagerSlot, viewsSlot, tapsSlot, chipSlot]) => {
			const pager = document.querySelector<HTMLElement>(pagerSlot!)!;
			const views = document.querySelector<HTMLElement>(viewsSlot!)!;
			const taps = document.querySelector<HTMLElement>(tapsSlot!)!;
			const chip = document.querySelector<HTMLElement>(chipSlot!)!;
			const frames: GlideFrame[] = [];
			window.__glideFrames = frames;
			const sample = () => {
				frames.push({
					progress: pager.scrollLeft / pager.clientWidth,
					locked: [views, taps]
						.filter((pane) => pane.inert)
						.map((pane) => pane.dataset.slot),
					chipLeft: chip.getBoundingClientRect().x,
					chipAnimated: chip.getAnimations().length > 0,
					path: location.pathname,
				});
				requestAnimationFrame(sample);
			};
			requestAnimationFrame(sample);
		},
		[PAGER, VIEWS_PANE, TAPS_PANE, CHIP],
	);

	await page.getByRole("link", { name: "Views" }).click();
	await expect(page).toHaveURL(new RegExp(`${VIEWS}$`));
	await expect
		.poll(() => page.locator(PAGER).evaluate((el) => el.scrollLeft))
		.toBe(0);
	await afterTwoFrames(page);

	const frames = (await page.evaluate(() => window.__glideFrames))!;
	const gliding = frames.filter(
		({ progress }) => progress > 0.05 && progress < 0.95,
	);
	expect(
		gliding.length,
		"the glide was seen between the tabs",
	).toBeGreaterThan(0);
	return { frames, gliding };
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
