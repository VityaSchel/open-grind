import { expect, type Page, test } from "@playwright/test";

import { ACTIVE_SURFACE, CONTROLS, openClip } from "./support/video";

const MUTE = `${CONTROLS} button[aria-label="Mute"], ${CONTROLS} button[aria-label="Unmute"]`;
const SCRUBBER = `${ACTIVE_SURFACE} [role="slider"]`;

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
			};
		},
		{ controls: CONTROLS, mute: MUTE, scrubber: SCRUBBER },
	);
}

test.describe("video controls layout", () => {
	test("a narrow window keeps every control inside the bar", async ({
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
	});

	test("a phone-width window insets the bar 1rem from the slide edges", async ({
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

		expect(g.barLeft - slideLeft, "on the left").toBeCloseTo(16, 0);
		expect(slideRight - g.barRight, "and on the right").toBeCloseTo(16, 0);
	});

	test("a wide window caps the bar and centers it at the slide's bottom", async ({
		page,
	}) => {
		await page.setViewportSize({ width: 1280, height: 720 });
		await openClip(page);
		await page.locator(ACTIVE_SURFACE).hover();
		await page.waitForTimeout(300);

		const slide = (await page.locator(ACTIVE_SURFACE).boundingBox())!;
		const bar = (await page.locator(CONTROLS).boundingBox())!;

		expect(bar.width, "the bar stops growing at 36rem").toBeCloseTo(576, 0);
		expect(bar.x - slide.x, "centered").toBeCloseTo(
			slide.x + slide.width - (bar.x + bar.width),
			0,
		);
		expect(
			slide.y + slide.height - (bar.y + bar.height),
			"1rem above the slide's bottom",
		).toBeCloseTo(16, 0);
	});
});
