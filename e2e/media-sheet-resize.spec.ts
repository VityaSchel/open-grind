import { expect, type Page, test } from "@playwright/test";

import { box, DRAWER, snapTops } from "./support/drawer";
import {
	gifSearchBox,
	gifTiles,
	openStickers,
	refuseRealGiphy,
} from "./support/stickers";

const VIEWPORT_WIDTH = 420;
const TALL_VIEWPORT = 800;
const KEYBOARD_VIEWPORT = 500;
const SNAP_TOLERANCE_PX = 1;
const GRID_SCROLL = 300;
const SCROLLER = "[data-slot=sheet-scroller]";
const SCROLL_ANCHORING = [
	{ anchoring: "with scroll anchoring", overflowAnchor: "auto" },
	{ anchoring: "without scroll anchoring", overflowAnchor: "none" },
] as const;

type SheetSnap = "full" | "short" | "between";
type OverflowAnchor = (typeof SCROLL_ANCHORING)[number]["overflowAnchor"];

async function sheetSnap(page: Page): Promise<SheetSnap> {
	const { full, short } = await snapTops(page);
	const { top } = await box(page);
	if (Math.abs(top - full) <= SNAP_TOLERANCE_PX) return "full";
	if (Math.abs(top - short) <= SNAP_TOLERANCE_PX) return "short";
	return "between";
}

async function expectSheetAt(
	page: Page,
	{ snap, viewportHeight }: { snap: SheetSnap; viewportHeight: number },
): Promise<void> {
	await expect
		.poll(async () => ({
			viewport: (await snapTops(page)).viewport,
			snap: await sheetSnap(page),
		}))
		.toEqual({ viewport: viewportHeight, snap });
}

function afterPendingScrollEvents(page: Page): Promise<void> {
	return page.evaluate(
		() =>
			new Promise<void>((resolve) =>
				requestAnimationFrame(() =>
					requestAnimationFrame(() => resolve()),
				),
			),
	);
}

async function setViewportHeight(
	page: Page,
	{ height }: { height: number },
): Promise<void> {
	await afterPendingScrollEvents(page);
	await page.setViewportSize({ width: VIEWPORT_WIDTH, height });
}

async function openSheet(
	page: Page,
	{ overflowAnchor }: { overflowAnchor: OverflowAnchor },
): Promise<void> {
	await openStickers(page);
	await page.locator(SCROLLER).evaluate((scroller, value) => {
		scroller.style.overflowAnchor = value;
	}, overflowAnchor);
}

function expandSheet(page: Page) {
	return page.evaluate((scrollerSelector) => {
		const scroller = document.querySelector<HTMLElement>(scrollerSelector)!;
		scroller.scrollTop = document.querySelector<HTMLElement>(
			"[data-slot=sheet-peek]",
		)!.offsetHeight;
	}, SCROLLER);
}

function scrollGridBy(page: Page, { pixels }: { pixels: number }) {
	return page.locator(SCROLLER).evaluate((scroller, delta) => {
		scroller.scrollTop += delta;
	}, pixels);
}

function drawerHeight(page: Page): Promise<number> {
	return page
		.locator(DRAWER)
		.evaluate((drawer) =>
			Math.round(drawer.getBoundingClientRect().height),
		);
}

test.beforeEach(async ({ page }) => {
	await refuseRealGiphy(page);
	await setViewportHeight(page, { height: TALL_VIEWPORT });
});

for (const { anchoring, overflowAnchor } of SCROLL_ANCHORING) {
	test.describe(`media sheet across viewport resizes ${anchoring}`, () => {
		test("an expanded sheet stays at full size as the viewport height changes", async ({
			page,
		}) => {
			await openSheet(page, { overflowAnchor });
			await expandSheet(page);
			await expectSheetAt(page, {
				snap: "full",
				viewportHeight: TALL_VIEWPORT,
			});
			const tallPeek = (await box(page)).expandRange;

			await setViewportHeight(page, { height: KEYBOARD_VIEWPORT });
			await expectSheetAt(page, {
				snap: "full",
				viewportHeight: KEYBOARD_VIEWPORT,
			});
			expect((await box(page)).expandRange).toBeLessThan(tallPeek);

			await setViewportHeight(page, { height: TALL_VIEWPORT });
			await expectSheetAt(page, {
				snap: "full",
				viewportHeight: TALL_VIEWPORT,
			});
			expect((await box(page)).expandRange).toBe(tallPeek);
		});

		test("a sheet scrolled into its grid keeps the grid offset as the viewport height changes", async ({
			page,
		}) => {
			await openSheet(page, { overflowAnchor });
			await expandSheet(page);
			await scrollGridBy(page, { pixels: GRID_SCROLL });
			await expect
				.poll(async () => (await box(page)).gridScrollTop)
				.toBe(GRID_SCROLL);

			for (const height of [KEYBOARD_VIEWPORT, TALL_VIEWPORT]) {
				await setViewportHeight(page, { height });
				await expect
					.poll(async () => {
						const { gridScrollTop, viewport } = await box(page);
						return { gridScrollTop, viewport };
					})
					.toEqual({ gridScrollTop: GRID_SCROLL, viewport: height });
			}
		});

		test("a sheet at the short snap stays short as the viewport height changes", async ({
			page,
		}) => {
			await openSheet(page, { overflowAnchor });
			await expectSheetAt(page, {
				snap: "short",
				viewportHeight: TALL_VIEWPORT,
			});

			for (const height of [KEYBOARD_VIEWPORT, TALL_VIEWPORT]) {
				await setViewportHeight(page, { height });
				await expectSheetAt(page, {
					snap: "short",
					viewportHeight: height,
				});
				expect((await box(page)).sheetScrollTop).toBe(0);
			}

			await expandSheet(page);
			await expectSheetAt(page, {
				snap: "full",
				viewportHeight: TALL_VIEWPORT,
			});
		});

		test("focusing the GIF search box and then blurring it leaves the sheet expanded", async ({
			page,
		}) => {
			await openSheet(page, { overflowAnchor });
			await expect(gifTiles(page).first()).toBeVisible();
			const tallDrawerHeight = await drawerHeight(page);
			const tallFullTop = (await snapTops(page)).full;

			await gifSearchBox(page).focus();
			await expect(gifSearchBox(page)).toBeFocused();
			await expectSheetAt(page, {
				snap: "full",
				viewportHeight: TALL_VIEWPORT,
			});

			await setViewportHeight(page, { height: KEYBOARD_VIEWPORT });
			await expectSheetAt(page, {
				snap: "full",
				viewportHeight: KEYBOARD_VIEWPORT,
			});
			expect(await drawerHeight(page)).toBeLessThan(tallDrawerHeight);

			await gifSearchBox(page).blur();
			await expect(gifSearchBox(page)).not.toBeFocused();
			await expectSheetAt(page, {
				snap: "full",
				viewportHeight: KEYBOARD_VIEWPORT,
			});

			await setViewportHeight(page, { height: TALL_VIEWPORT });
			await expectSheetAt(page, {
				snap: "full",
				viewportHeight: TALL_VIEWPORT,
			});
			expect(await drawerHeight(page)).toBe(tallDrawerHeight);
			expect((await snapTops(page)).full).toBe(tallFullTop);
		});
	});
}
