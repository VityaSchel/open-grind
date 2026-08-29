import { expect, type Page, test } from "@playwright/test";

import { DEMO_CONVERSATION, installTauriShim } from "./support/app";
import { CHAT_MEDIA_HOST, serveImages } from "./support/media";

const ALBUM_TRIGGER = 'button[aria-label="Open album"]';
const LIGHTBOX = ".pswp";
const SURFACE = '[data-slot="video-surface"]';
const ACTIVE_SURFACE = `.pswp__item:not([aria-hidden="true"]) ${SURFACE}`;
const CONTROLS =
	'.pswp__item:not([aria-hidden="true"]) [data-pswp-interactive]';
const MUTE = `${CONTROLS} button[aria-label="Mute"], ${CONTROLS} button[aria-label="Unmute"]`;
const SCRUBBER = `${ACTIVE_SURFACE} [role="slider"]`;

/** The demo clip is the last item of the conversation's album. */
const CLIP = "**/picsum.photos/seed/album-5001-2/600/800";

async function openClip(page: Page): Promise<void> {
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

function controlsGeometry(page: Page) {
	return page.evaluate(
		({ controls, mute, scrubber }) => {
			const bar = document
				.querySelector(controls)!
				.getBoundingClientRect();
			const speaker = document
				.querySelector(mute)!
				.getBoundingClientRect();
			const track = document
				.querySelector(scrubber)!
				.getBoundingClientRect();
			return {
				barWidth: bar.width,
				barLeft: bar.left,
				barRight: bar.right,
				muteLeft: speaker.left,
				muteRight: speaker.right,
				trackWidth: track.width,
				viewport: window.innerWidth,
			};
		},
		{ controls: CONTROLS, mute: MUTE, scrubber: SCRUBBER },
	);
}

test.describe("video controls layout", () => {
	test("a narrow slide keeps every control inside the bar", async ({
		page,
	}) => {
		await openClip(page);
		// resize after the opening animation: pswp only binds resize once it ends
		await page.setViewportSize({ width: 420, height: 260 });
		await page.waitForTimeout(600);
		// resizing fires pointerleave, which hides the bar; hover holds it open
		await page.locator(ACTIVE_SURFACE).hover();
		await page.waitForTimeout(300);

		const g = await controlsGeometry(page);

		expect(
			g.muteRight,
			"the mute button stays inside the bar rather than hanging off it",
		).toBeLessThanOrEqual(g.barRight + 0.5);
		expect(
			g.muteLeft,
			"and inside its left edge too",
		).toBeGreaterThanOrEqual(g.barLeft - 0.5);
		expect(
			g.trackWidth,
			"and the scrubber keeps a usable track instead of collapsing",
		).toBeGreaterThanOrEqual(64);
		expect(
			g.barWidth,
			"the bar may overhang the slide, but never the viewport",
		).toBeLessThanOrEqual(g.viewport);
	});

	test("a wide slide still insets the bar from the slide edges", async ({
		page,
	}) => {
		await openClip(page);
		await page.locator(ACTIVE_SURFACE).hover();
		await page.waitForTimeout(300);

		const { slideLeft, slideRight } = await page.evaluate((surface) => {
			const rect = document
				.querySelector(surface)!
				.getBoundingClientRect();
			return { slideLeft: rect.left, slideRight: rect.right };
		}, ACTIVE_SURFACE);
		const g = await controlsGeometry(page);

		expect(
			g.barLeft - slideLeft,
			"a wide slide keeps the 1rem inset on the left",
		).toBeCloseTo(16, 0);
		expect(slideRight - g.barRight, "and on the right").toBeCloseTo(16, 0);
	});
});
