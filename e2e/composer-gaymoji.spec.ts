import { expect, type Locator, test } from "@playwright/test";

import { recordDemoRequests } from "./support/demo-faults";
import {
	DEMO_GAYMOJI_COUNT,
	gaymojiManifestCalls,
	gaymojiTiles,
	giphyCalls,
	openStickers,
	stickersTab,
	TRANSPARENT_PIXEL,
} from "./support/stickers";

const DEMO_IMAGE_PREFIX = "data:image/svg+xml,";
const DEMO_IMAGE = /^data:image\/svg\+xml,/;
const TRANSPARENT = "rgba(0, 0, 0, 0)";

function imageOf(tile: Locator): Locator {
	return tile.locator("img");
}

function imageSrc(tile: Locator): Promise<string | null> {
	return imageOf(tile).getAttribute("src");
}

function imageState(tile: Locator) {
	return imageOf(tile).evaluate(
		(image: HTMLImageElement, demoImage) => ({
			loaded:
				image.src.startsWith(demoImage) &&
				image.complete &&
				image.naturalWidth > 0,
			background: getComputedStyle(image).backgroundColor,
			pulsing: image.classList.contains("animate-pulse"),
			tileBackground: getComputedStyle(image.closest("button")!)
				.backgroundColor,
		}),
		DEMO_IMAGE_PREFIX,
	);
}

test.describe("Gaymoji tab", () => {
	test("the manifest loads only once the tab opens, and every item renders", async ({
		page,
	}) => {
		const requests = await recordDemoRequests(page);
		await openStickers(page);
		await page.waitForTimeout(500);
		const beforeTab = await requests();
		expect(giphyCalls(beforeTab).length).toBeGreaterThan(0);
		expect(gaymojiManifestCalls(beforeTab)).toHaveLength(0);

		await stickersTab(page, { name: "Gaymoji" }).click();
		await expect(gaymojiTiles(page)).toHaveCount(DEMO_GAYMOJI_COUNT);
		await expect(gaymojiTiles(page).first()).toHaveAccessibleName("Yass");
		expect(gaymojiManifestCalls(await requests())).toHaveLength(1);

		await stickersTab(page, { name: "GIFs" }).click();
		await stickersTab(page, { name: "Gaymoji" }).click();
		await expect(gaymojiTiles(page)).toHaveCount(DEMO_GAYMOJI_COUNT);
		expect(gaymojiManifestCalls(await requests())).toHaveLength(1);
	});

	test("tiles far below the fold are requested only when scrolled near", async ({
		page,
	}) => {
		await openStickers(page, { stretchPanel: false });
		await stickersTab(page, { name: "Gaymoji" }).click();
		await expect(gaymojiTiles(page)).toHaveCount(DEMO_GAYMOJI_COUNT);
		const first = gaymojiTiles(page).first();
		const last = gaymojiTiles(page).last();

		await expect.poll(() => imageSrc(first)).toMatch(DEMO_IMAGE);
		expect(await imageSrc(last)).toBe(TRANSPARENT_PIXEL);
		const requested = await gaymojiTiles(page)
			.locator("img")
			.evaluateAll(
				(images, pixel) =>
					images.filter(
						(image) => image.getAttribute("src") !== pixel,
					).length,
				TRANSPARENT_PIXEL,
			);
		expect(requested).toBeGreaterThan(0);
		expect(requested).toBeLessThan(DEMO_GAYMOJI_COUNT / 4);

		await last.scrollIntoViewIfNeeded();
		await expect.poll(() => imageSrc(last)).toMatch(DEMO_IMAGE);
	});

	test("a loaded Gaymoji sits on a transparent tile; an unrequested one keeps a still muted tone", async ({
		page,
	}) => {
		await openStickers(page, { stretchPanel: false });
		await stickersTab(page, { name: "Gaymoji" }).click();
		await expect(gaymojiTiles(page)).toHaveCount(DEMO_GAYMOJI_COUNT);
		const first = gaymojiTiles(page).first();
		const last = gaymojiTiles(page).last();

		await expect
			.poll(() => imageState(first))
			.toEqual({
				loaded: true,
				background: TRANSPARENT,
				pulsing: false,
				tileBackground: TRANSPARENT,
			});

		const unrequested = await imageState(last);
		expect(await imageSrc(last)).toBe(TRANSPARENT_PIXEL);
		expect(unrequested.background).not.toBe(TRANSPARENT);
		expect(unrequested.pulsing).toBe(false);
	});
});
