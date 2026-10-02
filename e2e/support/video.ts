import type { Page } from "@playwright/test";

import { DEMO_CONVERSATION, installTauriShim } from "./app";
import { CHAT_MEDIA_HOST, serveImages } from "./media";

const ALBUM_TRIGGER = 'button[aria-label="Open album"]';
export const LIGHTBOX = ".pswp";
const SURFACE = '[data-slot="video-surface"]';
export const ACTIVE_SURFACE = `.pswp__item:not([aria-hidden="true"]) ${SURFACE}`;

/** The demo clip is the last item of the conversation's album. */
const CLIP = "**/picsum.photos/seed/album-5001-2/600/800";

export async function openClip(page: Page): Promise<void> {
	await installTauriShim(page);
	await serveImages(page, CHAT_MEDIA_HOST);
	// left pending on purpose: an errored <video> is swapped for a placeholder
	await page.route(CLIP, () => {});
	await page.goto(DEMO_CONVERSATION);
	await page.locator(ALBUM_TRIGGER).first().waitFor({ timeout: 60_000 });
	await page.locator(ALBUM_TRIGGER).first().click();
	await page.locator(LIGHTBOX).waitFor({ timeout: 30_000 });
	// the clip is the album's last item, and pswp preloads neighbours, so wait
	// for the surface to be inside the VISIBLE slide rather than merely present
	for (let step = 0; step < 6; step += 1) {
		if ((await page.locator(ACTIVE_SURFACE).count()) > 0) break;
		await page.evaluate(() =>
			document.dispatchEvent(
				new KeyboardEvent("keydown", {
					key: "ArrowRight",
					bubbles: true,
				}),
			),
		);
		await page.waitForTimeout(500);
	}
	await page.locator(ACTIVE_SURFACE).waitFor({ timeout: 10_000 });
}
