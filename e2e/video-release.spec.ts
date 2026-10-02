import { expect, test } from "@playwright/test";

import { ACTIVE_SURFACE, LIGHTBOX, openClip } from "./support/video";

test.describe("video release", () => {
	test("a closed lightbox lets go of the clip it was still loading", async ({
		page,
	}) => {
		await openClip(page);
		const video = await page
			.locator(`${ACTIVE_SURFACE} [data-slot="video-player-media"]`)
			.elementHandle();
		if (video === null) throw new Error("the clip has no video element");
		const loading = await video.evaluate(
			(element: HTMLVideoElement) =>
				element.networkState === HTMLMediaElement.NETWORK_LOADING,
		);
		expect(loading, "the clip is mid-load while the lightbox is up").toBe(
			true,
		);

		await page.keyboard.press("Escape");
		await page.locator(LIGHTBOX).waitFor({ state: "detached" });

		const released = await video.evaluate((element: HTMLVideoElement) => ({
			source: element.getAttribute("src"),
			idle: element.networkState === HTMLMediaElement.NETWORK_EMPTY,
		}));
		expect(released).toEqual({ source: null, idle: true });
	});
});
