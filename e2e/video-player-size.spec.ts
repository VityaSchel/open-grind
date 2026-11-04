import { expect, type Page, test } from "@playwright/test";

import { installTauriShim } from "./support/app";
import { sendInsets } from "./support/keyboard";
import { AVATAR_HOST, CHAT_MEDIA_HOST, serveImages } from "./support/media";
import { ACTIVE_SURFACE, openClip } from "./support/video";

const CUTOUT_LEFT = { top: 30, right: 0, bottom: 15, left: 33, ime: false };
const CUTOUT_RIGHT = { ...CUTOUT_LEFT, right: 33, left: 0 };

function playbackArea(page: Page) {
	return page.evaluate(() => {
		const rootStyle = getComputedStyle(document.documentElement);
		const inset = (side: string) =>
			parseFloat(rootStyle.getPropertyValue(`--safe-area-${side}`)) || 0;
		const composer = document
			.querySelector(".pswp__reply-composer")
			?.getBoundingClientRect();
		return {
			x: inset("left"),
			y: inset("top"),
			width: innerWidth - inset("left") - inset("right"),
			height:
				innerHeight -
				inset("top") -
				inset("bottom") -
				(composer?.height ?? 0),
		};
	});
}

test.describe("video player size", () => {
	test("a clip fills the space above the reply composer between the insets", async ({
		page,
	}) => {
		await openClip(page);
		await expect(
			page.getByRole("textbox", { name: "Reply to album item" }),
		).toBeVisible();

		const area = await playbackArea(page);
		expect(area.y, "test insets are active").toBeGreaterThan(0);
		await expect
			.poll(() => page.locator(ACTIVE_SURFACE).boundingBox())
			.toEqual(area);
	});

	test("a clip follows the insets when they move without a resize", async ({
		page,
	}) => {
		await openClip(page);

		for (const insets of [CUTOUT_LEFT, CUTOUT_RIGHT]) {
			await sendInsets(page, insets);
			const area = await playbackArea(page);
			await expect
				.poll(() => page.locator(ACTIVE_SURFACE).boundingBox())
				.toEqual(area);
		}
	});

	test("an own album clip fills the safe area without a composer", async ({
		page,
	}) => {
		await installTauriShim(page);
		await serveImages(page, CHAT_MEDIA_HOST);
		await serveImages(page, AVATAR_HOST);
		await page.route("**/picsum.photos/seed/album-901-0/600/800", () => {});
		await page.goto("/settings/albums/901");
		await page
			.getByRole("button", { name: "Preview album", exact: true })
			.click();
		await page.locator(ACTIVE_SURFACE).waitFor();
		await expect(page.locator(".pswp__reply-composer")).toHaveCount(0);

		for (const insets of [CUTOUT_LEFT, CUTOUT_RIGHT]) {
			await sendInsets(page, insets);
			const area = await playbackArea(page);
			await expect
				.poll(() => page.locator(ACTIVE_SURFACE).boundingBox())
				.toEqual(area);
		}
	});
});
