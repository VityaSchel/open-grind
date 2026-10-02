import { expect, test } from "@playwright/test";

import {
	afterTwoFrames,
	historyDepth,
	holdPagerAt,
	TrustedTouch,
	wheel,
} from "./support/app";
import {
	glideToViews,
	LIST_SCROLLERS,
	openTaps,
	PAGER,
	panesSwallowingClicks,
	rowsOnScreen,
	swipeAcross,
	TAP_ROW,
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
		__heardRows?: string[];
		__scrollerClassChanges?: string[];
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

test("a finger held past halfway has only the tab being left swallow clicks, and landing lets it take them again", async ({
	page,
}) => {
	const pager = page.locator(PAGER);
	const width = await pager.evaluate((el) => el.clientWidth);

	const touch = await swipeAcross(page, {
		distancePx: Math.round(width * 0.65),
		release: false,
	});

	await expect.poll(() => panesSwallowingClicks(page)).toEqual([TAPS_PANE]);
	await expect(pager.locator("[inert]")).toHaveCount(0);

	await touch.end();

	await expect(page).toHaveURL(new RegExp(`${VIEWS}$`));
	await expect.poll(() => panesSwallowingClicks(page)).toEqual([]);
});

test("both lists keep their classes while a finger drags the pager between tabs and lands", async ({
	page,
}) => {
	const pager = page.locator(PAGER);
	const width = await pager.evaluate((el) => el.clientWidth);
	await pager.evaluate((el, scrollers) => {
		const changed: string[] = [];
		window.__scrollerClassChanges = changed;
		new MutationObserver((records) => {
			for (const { target } of records)
				if (target instanceof Element && target.matches(scrollers))
					changed.push(target.getAttribute("data-slot")!);
		}).observe(el, { attributeFilter: ["class"], subtree: true });
	}, LIST_SCROLLERS.join());

	const touch = await swipeAcross(page, {
		distancePx: Math.round(width * 0.65),
		release: false,
	});
	await expect(page.locator(LIST_SCROLLERS.join())).toHaveCount(2);
	await afterTwoFrames(page);
	await touch.end();
	await expect(page).toHaveURL(new RegExp(`${VIEWS}$`));
	await afterTwoFrames(page);

	expect(await page.evaluate(() => window.__scrollerClassChanges)).toEqual(
		[],
	);
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

test("a tab tap has the list being left swallow clicks for the whole glide", async ({
	page,
}) => {
	const { frames, gliding } = await glideToViews(page);

	expect(
		gliding.filter(
			({ swallowingClicks }) => swallowingClicks.join() !== TAPS_PANE,
		),
		"only Taps, the list being left, swallows clicks on every frame of the glide",
	).toEqual([]);
	expect(
		frames.at(-1)?.swallowingClicks,
		"both lists take clicks at rest",
	).toEqual([]);
});

test("a finger that lifts before halfway has the list being left swallow clicks as soon as the pager moves on", async ({
	page,
}) => {
	await holdPagerAt(page.locator(PAGER), { progress: 0.7 });
	await expect.poll(() => panesSwallowingClicks(page)).toEqual([VIEWS_PANE]);

	const swallowingOnTheNextFrame = await page.locator(PAGER).evaluate(
		(pager) =>
			new Promise((resolve) => {
				window.dispatchEvent(
					new TouchEvent("touchend", { touches: [] }),
				);
				pager.scrollLeft = Math.round(pager.clientWidth * 0.6);
				requestAnimationFrame(() =>
					resolve(window.__panesSwallowingClicks!()),
				);
			}),
	);

	expect(swallowingOnTheNextFrame).toEqual([TAPS_PANE]);
});

test("a row of the tab being left opens nothing when clicked, while a row of the incoming tab opens its profile", async ({
	page,
}) => {
	const pager = page.locator(PAGER);
	await holdPagerAt(pager, { progress: 0.35 });
	await expect.poll(() => panesSwallowingClicks(page)).toEqual([TAPS_PANE]);
	await page
		.locator(`${VIEWS_PANE} ${TAP_ROW}`)
		.first()
		.waitFor({ timeout: 60_000 });
	await afterTwoFrames(page);
	const depth = await historyDepth(page);
	const [leaving] = await rowsOnScreen(page, { pane: TAPS_PANE });
	const incoming = (await rowsOnScreen(page, { pane: VIEWS_PANE })).find(
		({ href }) => href !== leaving?.href,
	);
	expect(leaving, "a row of the tab being left is on screen").toBeDefined();
	expect(incoming, "a row of the incoming tab is on screen").toBeDefined();

	await page.evaluate(() => {
		window.__heardRows = [];
		document.addEventListener("click", ({ target }) => {
			const row = target instanceof Element ? target.closest("a") : null;
			window.__heardRows!.push(row?.pathname ?? "");
		});
	});

	await page.mouse.click(leaving!.x, leaving!.y);
	await page.mouse.click(incoming!.x, incoming!.y);

	await expect(page).toHaveURL(new RegExp(`${incoming!.href}$`));
	expect(
		await page.evaluate(() => window.__heardRows),
		"the click on the row being left never reached the app",
	).toEqual([incoming!.href]);
	expect(
		await historyDepth(page),
		"only the incoming row opened a profile",
	).toBe(depth + 1);
});

test("a wheel over the tab being left still scrolls it, and so does one over the incoming tab", async ({
	page,
}) => {
	const pager = page.locator(PAGER);
	await holdPagerAt(pager, { progress: 0.35 });
	await page
		.locator(`${VIEWS_PANE} ${TAP_ROW}`)
		.first()
		.waitFor({ timeout: 60_000 });
	await afterTwoFrames(page);
	const box = (await pager.boundingBox())!;
	const seam = (await page.locator(TAPS_PANE).boundingBox())!.x;
	const y = box.y + box.height / 2;

	await wheel(page, { x: (seam + box.x + box.width) / 2, y }, 300);
	await wheel(page, { x: (box.x + seam) / 2, y }, 300);

	for (const scroller of [TAPS_SCROLLER, VIEWS_SCROLLER])
		await expect
			.poll(() => page.locator(scroller).evaluate((el) => el.scrollTop))
			.toBeGreaterThan(0);
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
