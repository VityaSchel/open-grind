import { expect, test } from "@playwright/test";

import {
	afterTwoFrames,
	historyDepth,
	holdPagerAt,
	TrustedTouch,
	wheel,
} from "./support/app";
import {
	CHIP,
	glideToViews,
	LIST_SCROLLERS,
	listScrollbars,
	openTaps,
	PAGER,
	swipeAcross,
	tabTrack,
	TAPS,
	TAPS_PANE,
	TAPS_SCROLLER,
	VIEWS,
	VIEWS_PANE,
	VIEWS_SCROLLER,
} from "./support/interest-pager";

declare global {
	interface Window {
		__clickedPanes?: string[];
		__chipDetachedAt?: number[];
	}
}

test.describe.configure({ timeout: 300_000 });

test.beforeEach(async ({ page }) => {
	await openTaps(page);
});

test("the pager starts on the routed tab and mounts only that list", async ({
	page,
}) => {
	const pager = page.locator(PAGER);
	const geometry = await pager.evaluate(
		(el, scrollers) => ({
			scrollLeft: el.scrollLeft,
			clientWidth: el.clientWidth,
			scrollWidth: el.scrollWidth,
			height: Math.round(el.getBoundingClientRect().height),
			scrollers: el.querySelectorAll(scrollers).length,
		}),
		LIST_SCROLLERS.join(),
	);

	expect(geometry.scrollWidth, "two panes wide").toBe(
		geometry.clientWidth * 2,
	);
	expect(geometry.scrollLeft, "starts on Taps, the second pane").toBe(
		geometry.clientWidth,
	);
	expect(geometry.scrollers, "only the routed list is mounted").toBe(1);
	expect(geometry.height, "a pane is a full screen tall").toBeGreaterThan(
		300,
	);
});

test("a scroll that lands on Views switches the tab and updates the URL without pushing history", async ({
	page,
}) => {
	const pager = page.locator(PAGER);
	const before = await pager.evaluate((el) => el.scrollLeft);
	const depth = await historyDepth(page);

	await pager.evaluate((el) => el.scrollTo({ left: 0, behavior: "smooth" }));
	await expect.poll(() => pager.evaluate((el) => el.scrollLeft)).toBe(0);

	await expect(page).toHaveURL(new RegExp(`${VIEWS}$`));
	expect(before, "started on the second pane").toBeGreaterThan(0);
	expect(
		await historyDepth(page),
		"a tab switch must not push an entry",
	).toBe(depth);
	await expect(page.locator(LIST_SCROLLERS.join())).toHaveCount(2);
});

test("a finger drag inside the list pages to the other tab", async ({
	page,
}) => {
	const pager = page.locator(PAGER);
	const width = await pager.evaluate((el) => el.clientWidth);

	await swipeAcross(page, { distancePx: Math.round(width * 0.75) });

	await expect.poll(() => pager.evaluate((el) => el.scrollLeft)).toBe(0);
	await expect(page).toHaveURL(new RegExp(`${VIEWS}$`));
});

test("a finger held on the other tab keeps the URL until it lifts", async ({
	page,
}) => {
	const pager = page.locator(PAGER);
	const width = await pager.evaluate((el) => el.clientWidth);

	const touch = await swipeAcross(page, {
		distancePx: Math.round(width * 1.1),
		release: false,
	});
	await page.waitForTimeout(1000);

	expect(
		await pager.evaluate((el) => el.scrollLeft),
		"the held finger has pulled Views fully in",
	).toBe(0);
	expect(
		new URL(page.url()).pathname,
		"a held finger must not switch the tab",
	).toBe(TAPS);

	await touch.end();

	await expect(page).toHaveURL(new RegExp(`${VIEWS}$`));
});

test("a finger held past halfway locks only the tab being left, and landing unlocks it", async ({
	page,
}) => {
	const pager = page.locator(PAGER);
	const views = page.locator(VIEWS_PANE);
	const taps = page.locator(TAPS_PANE);
	const width = await pager.evaluate((el) => el.clientWidth);

	const touch = await swipeAcross(page, {
		distancePx: Math.round(width * 0.65),
		release: false,
	});

	await expect(taps).toHaveAttribute("inert", "");
	await expect(views).not.toHaveAttribute("inert");

	await touch.end();

	await expect(page).toHaveURL(new RegExp(`${VIEWS}$`));
	await expect(taps).not.toHaveAttribute("inert");
	await expect(views).not.toHaveAttribute("inert");
});

test("both lists drop their scrollbar while a finger holds the pager between tabs, and show it again once it lands", async ({
	page,
}) => {
	const pager = page.locator(PAGER);
	const width = await pager.evaluate((el) => el.clientWidth);
	const shown = { scrollbarWidth: "auto", contentWidth: width };
	const hidden = { scrollbarWidth: "none", contentWidth: width };
	expect(await listScrollbars(page)).toEqual([null, shown]);

	const touch = await swipeAcross(page, {
		distancePx: Math.round(width * 0.65),
		release: false,
	});

	await expect.poll(() => listScrollbars(page)).toEqual([hidden, hidden]);

	await touch.end();

	await expect(page).toHaveURL(new RegExp(`${VIEWS}$`));
	await expect.poll(() => listScrollbars(page)).toEqual([shown, shown]);
});

test("a click over the tab being left reaches nothing in it, while the incoming tab takes one", async ({
	page,
}) => {
	const pager = page.locator(PAGER);
	const width = await pager.evaluate((el) => el.clientWidth);
	const touch = await swipeAcross(page, {
		distancePx: Math.round(width * 0.65),
		release: false,
	});
	await expect
		.poll(() => pager.evaluate((el) => el.scrollLeft / el.clientWidth))
		.toBeLessThan(0.5);
	await afterTwoFrames(page);
	const box = (await pager.boundingBox())!;
	const seam = (await page.locator(TAPS_PANE).boundingBox())!.x;
	const y = box.y + box.height / 2;
	await page.evaluate(
		(panes) => {
			window.__clickedPanes = [];
			for (const pane of panes)
				document.querySelector(pane)!.addEventListener(
					"click",
					(event) => {
						event.preventDefault();
						window.__clickedPanes!.push(pane);
					},
					{ capture: true },
				);
		},
		[VIEWS_PANE, TAPS_PANE],
	);

	await page.mouse.click((seam + box.x + box.width) / 2, y);
	await page.mouse.click((box.x + seam) / 2, y);

	expect(await page.evaluate(() => window.__clickedPanes)).toEqual([
		VIEWS_PANE,
	]);
	await touch.end();
});

test("a tab tap keeps the list being left locked for the whole glide", async ({
	page,
}) => {
	const { frames, gliding } = await glideToViews(page);

	expect(
		gliding.filter(({ locked }) => locked.join() !== "interest-pane-taps"),
		"only Taps, the list being left, is locked on every frame of the glide",
	).toEqual([]);
	expect(frames.at(-1)?.locked, "nothing stays locked at rest").toEqual([]);
});

test("a finger that lifts before halfway locks the list being left as soon as the pager moves on", async ({
	page,
}) => {
	await holdPagerAt(page.locator(PAGER), { progress: 0.7 });
	await expect(page.locator(VIEWS_PANE)).toHaveAttribute("inert", "");
	await expect(page.locator(TAPS_PANE)).not.toHaveAttribute("inert");

	const lockedOnTheNextFrame = await page.locator(PAGER).evaluate(
		(pager) =>
			new Promise((resolve) => {
				window.dispatchEvent(
					new TouchEvent("touchend", { touches: [] }),
				);
				pager.scrollLeft = Math.round(pager.clientWidth * 0.6);
				requestAnimationFrame(() =>
					resolve(
						Array.from(pager.children)
							.filter(
								(pane) =>
									pane instanceof HTMLElement && pane.inert,
							)
							.map((pane) => pane.getAttribute("data-slot")),
					),
				);
			}),
	);

	expect(lockedOnTheNextFrame).toEqual(["interest-pane-taps"]);
});

test("a wheel over the tab being left scrolls nothing in it, while the incoming tab scrolls", async ({
	page,
}) => {
	const pager = page.locator(PAGER);
	await holdPagerAt(pager, { progress: 0.35 });
	await expect(page.locator(TAPS_PANE)).toHaveAttribute("inert", "");
	await page
		.locator(`${VIEWS_PANE} a[href^="/profile/"]`)
		.first()
		.waitFor({ timeout: 60_000 });
	await afterTwoFrames(page);
	const box = (await pager.boundingBox())!;
	const seam = (await page.locator(TAPS_PANE).boundingBox())!.x;
	const y = box.y + box.height / 2;

	await wheel(page, { x: (seam + box.x + box.width) / 2, y }, 300);
	await wheel(page, { x: (box.x + seam) / 2, y }, 300);

	await expect
		.poll(() => page.locator(VIEWS_SCROLLER).evaluate((el) => el.scrollTop))
		.toBeGreaterThan(0);
	expect(
		await page.locator(TAPS_SCROLLER).evaluate((el) => el.scrollTop),
		"the locked list must not scroll",
	).toBe(0);
});

test("a vertical finger drag scrolls the list and does not page", async ({
	page,
}) => {
	const pager = page.locator(PAGER);
	const scroller = page.locator(TAPS_SCROLLER);
	const width = await pager.evaluate((el) => el.clientWidth);
	const box = (await scroller.boundingBox())!;

	const touch = await TrustedTouch.attach(page);
	await touch.drag(
		page,
		{ x: box.x + box.width / 2, y: box.y + box.height * 0.7 },
		{ x: box.x + box.width / 2, y: box.y + box.height * 0.2 },
		{ steps: 16, holdMs: 16 },
	);

	expect(
		await pager.evaluate((el) => el.scrollLeft),
		"a vertical drag must not page sideways",
	).toBe(width);
	expect(
		await scroller.evaluate((el) => el.scrollTop),
		"it should have scrolled the list instead",
	).toBeGreaterThan(0);
	await expect(page).toHaveURL(new RegExp(`${TAPS}$`));
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

test("the chip is animated only while the pager is held or between tabs", async ({
	page,
}) => {
	const pager = page.locator(PAGER);
	const { views, span } = await tabTrack(page);
	const chipProgress = async () =>
		((await page.locator(CHIP).boundingBox())!.x - views) / span;
	const animations = () =>
		page
			.locator(CHIP)
			.evaluate((chip) => ({
				onChip: chip.getAnimations().length,
				running: document
					.getAnimations()
					.filter((animation) => animation.playState === "running")
					.length,
			}));
	const atRest = { onChip: 0, running: 0 };

	await expect.poll(animations, "a fresh entry on Taps").toEqual(atRest);
	expect(await chipProgress()).toBeCloseTo(1, 2);

	const width = await pager.evaluate((el) => el.clientWidth);
	const touch = await swipeAcross(page, {
		distancePx: Math.round(width * 0.65),
		release: false,
	});

	await expect.poll(chipProgress).toBeLessThan(0.8);
	expect(await chipProgress()).toBeGreaterThan(0.2);
	expect((await animations()).onChip, "a held swipe drives the chip").toBe(1);

	await touch.end();
	await expect(page).toHaveURL(new RegExp(`${VIEWS}$`));

	await expect.poll(animations, "at rest on Views").toEqual(atRest);
	expect(await chipProgress()).toBeCloseTo(0, 2);

	await page.getByRole("link", { name: "Taps" }).click();
	await expect(page).toHaveURL(new RegExp(`${TAPS}$`));
	await expect.poll(() => pager.evaluate((el) => el.scrollLeft)).toBe(width);

	await expect.poll(animations, "back at rest on Taps").toEqual(atRest);
	expect(await chipProgress()).toBeCloseTo(1, 2);
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
