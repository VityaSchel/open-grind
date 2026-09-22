import { expect, type Page, test } from "@playwright/test";

import { installTauriShim, TrustedTouch } from "./support/app";

const TAPS = "/interest/taps";
const VIEWS = "/interest/views";
const PAGER = '[data-slot="interest-pager"]';
const PROFILE_LINK = 'a[href^="/profile/"]';

test.describe.configure({ timeout: 300_000 });

test.beforeEach(async ({ page }) => {
	await installTauriShim(page);
	await page.goto(TAPS);
	await page.locator(PROFILE_LINK).first().waitFor({ timeout: 180_000 });
});

test("the pager starts on the routed tab and mounts only that list", async ({
	page,
}) => {
	const pager = page.locator(PAGER);
	const geometry = await pager.evaluate((el) => ({
		scrollLeft: el.scrollLeft,
		clientWidth: el.clientWidth,
		scrollWidth: el.scrollWidth,
		height: Math.round(el.getBoundingClientRect().height),
		scrollers: el.querySelectorAll(".pull-scroller").length,
	}));

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
	const depth = await page.evaluate(() => history.length);

	await pager.evaluate((el) => el.scrollTo({ left: 0, behavior: "smooth" }));
	await expect.poll(() => pager.evaluate((el) => el.scrollLeft)).toBe(0);

	await expect(page).toHaveURL(new RegExp(`${VIEWS}$`));
	expect(before, "started on the second pane").toBeGreaterThan(0);
	expect(
		await page.evaluate(() => history.length),
		"a tab switch must not push an entry",
	).toBe(depth);
	await expect(page.locator(`${PAGER} .pull-scroller`)).toHaveCount(2);
});

async function swipeAcross(
	page: Page,
	{ distancePx, release = true }: { distancePx: number; release?: boolean },
) {
	const box = (await page
		.locator(`${PAGER} .pull-scroller`)
		.first()
		.boundingBox())!;
	const touch = await TrustedTouch.attach(page);
	await touch.drag(
		page,
		{ x: box.x + box.width * 0.3, y: box.y + box.height / 2 },
		{ x: box.x + box.width * 0.3 + distancePx, y: box.y + box.height / 2 },
		{ steps: 16, holdMs: 16, release },
	);
	return touch;
}

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

test("a vertical finger drag scrolls the list and does not page", async ({
	page,
}) => {
	const pager = page.locator(PAGER);
	const scroller = page.locator(`${PAGER} .pull-scroller`).first();
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
	const chip = page.locator('[data-slot="interest-tab-chip"]');
	const box = async (locator: ReturnType<Page["locator"]>) =>
		(await locator.boundingBox())!;
	const views = await box(page.getByRole("link", { name: "Views" }));
	const taps = await box(page.getByRole("link", { name: "Taps" }));

	await expect.poll(async () => (await box(chip)).x).toBeCloseTo(taps.x, 0);
	expect((await box(chip)).width).toBeCloseTo(taps.width, 0);

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
		const expected = views.x + (taps.x - views.x) * progress;
		return Math.abs((await box(chip)).x - expected);
	};
	await expect.poll(chipOffTrack).toBeLessThan(1);

	await touch.end();
	await expect(page).toHaveURL(new RegExp(`${VIEWS}$`));
	await expect.poll(async () => (await box(chip)).x).toBeCloseTo(views.x, 0);
});
