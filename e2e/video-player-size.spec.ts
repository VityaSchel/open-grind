import { expect, type Page, test } from "@playwright/test";

import { sendInsets } from "./support/keyboard";
import { ACTIVE_SURFACE, openClip } from "./support/video";

const CUTOUT_LEFT = { top: 30, right: 0, bottom: 15, left: 33, ime: false };
const CUTOUT_RIGHT = { ...CUTOUT_LEFT, right: 33, left: 0 };

function safeArea(page: Page) {
	return page.evaluate(() => {
		const rootStyle = getComputedStyle(document.documentElement);
		const inset = (side: string) =>
			parseFloat(rootStyle.getPropertyValue(`--safe-area-${side}`)) || 0;
		return {
			x: inset("left"),
			y: inset("top"),
			width: innerWidth - inset("left") - inset("right"),
			height: innerHeight - inset("top") - inset("bottom"),
		};
	});
}

test.describe("video player size", () => {
	test("a clip fills the screen between the insets, whatever its cover's shape", async ({
		page,
	}) => {
		await openClip(page);

		const area = await safeArea(page);
		expect(area.y, "test insets are active").toBeGreaterThan(0);
		expect(await page.locator(ACTIVE_SURFACE).boundingBox()).toEqual(area);
	});

	test("a clip follows the insets when they move without a resize", async ({
		page,
	}) => {
		await openClip(page);

		for (const insets of [CUTOUT_LEFT, CUTOUT_RIGHT]) {
			await sendInsets(page, insets);
			const area = await safeArea(page);
			await expect
				.poll(() => page.locator(ACTIVE_SURFACE).boundingBox())
				.toEqual(area);
		}
	});
});
