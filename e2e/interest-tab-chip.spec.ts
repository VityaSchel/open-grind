import { expect, type Page, test } from "@playwright/test";

import {
	CHIP,
	glideToViews,
	openTaps,
	PAGER,
	swipeAcross,
	tabTrack,
	TAPS,
	TAPS_SCROLLER,
	VIEWS,
} from "./support/interest-pager";

declare global {
	interface Window {
		__chipDetachedAt?: number[];
	}
}

const FOLLOWING = "tab-chip-following";
const FRAMES_AFTER_LANDING = 20;

test.describe.configure({ timeout: 300_000 });

const DRIVEN_BY_THE_PAGER = ["ScrollTimeline"];

function liveChipTimelines(page: Page) {
	return page.locator(CHIP).evaluate((chip) =>
		chip
			.getAnimations()
			.filter(
				({ playState }) =>
					playState !== "idle" && playState !== "paused",
			)
			.map(({ timeline }) => timeline?.constructor.name),
	);
}

async function chipProgress(page: Page) {
	const { views, span } = await tabTrack(page);
	return ((await page.locator(CHIP).boundingBox())!.x - views) / span;
}

test.describe("on Android", () => {
	test.beforeEach(async ({ page }) => {
		await openTaps(page, { platform: "android" });
	});

	test("the chip is animated only while the pager is held or between tabs", async ({
		page,
	}) => {
		const pager = page.locator(PAGER);
		const animations = () =>
			page
				.locator(CHIP)
				.evaluate((chip) => ({
					onChip: chip.getAnimations().length,
					running: document
						.getAnimations()
						.filter(
							(animation) => animation.playState === "running",
						).length,
				}));
		const atRest = { onChip: 0, running: 0 };

		await expect.poll(animations, "a fresh entry on Taps").toEqual(atRest);
		expect(await chipProgress(page)).toBeCloseTo(1, 2);

		const width = await pager.evaluate((el) => el.clientWidth);
		const touch = await swipeAcross(page, {
			distancePx: Math.round(width * 0.65),
			release: false,
		});

		await expect.poll(() => chipProgress(page)).toBeLessThan(0.8);
		expect(await chipProgress(page)).toBeGreaterThan(0.2);
		expect(
			(await animations()).onChip,
			"a held swipe drives the chip",
		).toBe(1);

		await touch.end();
		await expect(page).toHaveURL(new RegExp(`${VIEWS}$`));

		await expect.poll(animations, "at rest on Views").toEqual(atRest);
		expect(await chipProgress(page)).toBeCloseTo(0, 2);

		await page.getByRole("link", { name: "Taps" }).click();
		await expect(page).toHaveURL(new RegExp(`${TAPS}$`));
		await expect
			.poll(() => pager.evaluate((el) => el.scrollLeft))
			.toBe(width);

		await expect.poll(animations, "back at rest on Taps").toEqual(atRest);
		expect(await chipProgress(page)).toBeCloseTo(1, 2);
	});

	test("a tab tap carries the chip along with the pager on every frame", async ({
		page,
	}) => {
		const { views, span } = await tabTrack(page);
		const { frames } = await glideToViews(page);

		const offTrack = frames.map(({ progress, chipLeft }) =>
			Math.abs(chipLeft - (views + span * progress)),
		);
		expect(
			Math.max(...offTrack),
			"the chip never leaves the pager's position",
		).toBeLessThan(1);
		const pagerBehindRoute = frames.filter(
			({ path, progress }) => path === VIEWS && progress > 0.95,
		);
		expect(
			pagerBehindRoute.length,
			"the tap was seen before the pager moved",
		).toBeGreaterThan(0);
		expect(
			pagerBehindRoute.filter(({ chipAnimated }) => !chipAnimated),
			"the chip rides the pager from the tap on",
		).toEqual([]);
	});

	test("a flick the page was too busy to see keeps the chip riding the pager", async ({
		page,
	}) => {
		const pager = page.locator(PAGER);
		const box = (await page.locator(TAPS_SCROLLER).boundingBox())!;
		await page.evaluate(
			([pagerSlot, chipSlot]) => {
				const pager = document.querySelector<HTMLElement>(pagerSlot!)!;
				const chip = document.querySelector<HTMLElement>(chipSlot!)!;
				const detachedAt: number[] = [];
				window.__chipDetachedAt = detachedAt;
				new MutationObserver(() => {
					if (chip.getAnimations().length === 0)
						detachedAt.push(pager.scrollLeft / pager.clientWidth);
				}).observe(chip, { attributes: true });
				window.addEventListener(
					"touchstart",
					() => {
						const busyUntil = performance.now() + 200;
						while (performance.now() < busyUntil);
					},
					{ passive: true, capture: true, once: true },
				);
			},
			[PAGER, CHIP],
		);

		const cdp = await page.context().newCDPSession(page);
		await cdp.send("Input.synthesizeScrollGesture", {
			x: box.x + 100,
			y: box.y + box.height / 2,
			xDistance: 220,
			yDistance: 0,
			speed: 3000,
			preventFling: false,
			gestureSourceType: "touch",
		} as never);
		await cdp.detach();

		await expect(page).toHaveURL(new RegExp(`${VIEWS}$`));
		await expect.poll(() => pager.evaluate((el) => el.scrollLeft)).toBe(0);
		await expect
			.poll(() => page.evaluate(() => window.__chipDetachedAt))
			.not.toEqual([]);
		expect(
			await page.evaluate(() => window.__chipDetachedAt),
			"the chip lets go only once the pager rests on Views",
		).toEqual([0]);
	});
});

test.describe("off Android", () => {
	test.beforeEach(async ({ page }) => {
		await openTaps(page, { platform: "macos" });
	});

	test("the chip behind the tabs follows the pager wherever it is", async ({
		page,
	}) => {
		const chip = async () => (await page.locator(CHIP).boundingBox())!;
		const { views, span } = await tabTrack(page);
		const taps = (await page
			.getByRole("link", { name: "Taps" })
			.boundingBox())!;

		await expect.poll(async () => (await chip()).x).toBeCloseTo(taps.x, 0);
		expect((await chip()).width).toBeCloseTo(taps.width, 0);

		const pager = page.locator(PAGER);
		const width = await pager.evaluate((el) => el.clientWidth);
		const touch = await swipeAcross(page, {
			distancePx: Math.round(width * 0.65),
			release: false,
		});
		const chipOffTrack = async () => {
			const progress = await pager.evaluate(
				(el) => el.scrollLeft / el.clientWidth,
			);
			expect(progress).toBeGreaterThan(0.2);
			expect(progress).toBeLessThan(0.8);
			return Math.abs((await chip()).x - (views + span * progress));
		};
		await expect.poll(chipOffTrack).toBeLessThan(1);

		await touch.end();
		await expect(page).toHaveURL(new RegExp(`${VIEWS}$`));
		await expect.poll(async () => (await chip()).x).toBeCloseTo(views, 0);
	});

	test("the chip already rides the pager on a fresh entry, before anything scrolls", async ({
		page,
	}) => {
		await expect(page.locator(CHIP)).toContainClass(FOLLOWING);
		await expect
			.poll(() => liveChipTimelines(page))
			.toEqual(DRIVEN_BY_THE_PAGER);
		expect(await chipProgress(page)).toBeCloseTo(1, 2);
	});

	test("a tab tap never leaves the chip without its animation, from before the tap until after the pager lands", async ({
		page,
	}) => {
		const { views, span } = await tabTrack(page);
		const { frames: glide } = await glideToViews(page);
		await expect
			.poll(() => page.evaluate(() => window.__glideFrames!.length))
			.toBeGreaterThan(glide.length + FRAMES_AFTER_LANDING);
		const frames = (await page.evaluate(() => window.__glideFrames))!;

		expect(
			frames.filter(({ chipAnimated }) => !chipAnimated),
			"the chip is animated on every frame",
		).toEqual([]);
		expect(
			Math.max(
				...frames.map(({ progress, chipLeft }) =>
					Math.abs(chipLeft - (views + span * progress)),
				),
			),
			"the chip never leaves the pager's position",
		).toBeLessThan(1);
		expect(frames.at(-1)).toMatchObject({ path: VIEWS, progress: 0 });
		await expect(page.locator(CHIP)).toContainClass(FOLLOWING);
		expect(await liveChipTimelines(page)).toEqual(DRIVEN_BY_THE_PAGER);
	});
});
