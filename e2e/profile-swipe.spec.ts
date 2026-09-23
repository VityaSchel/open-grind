import { expect, type Page, test } from "@playwright/test";

import {
	afterTwoFrames,
	backLink,
	historyDepth,
	TrustedTouch,
} from "./support/app";
import {
	ACTIVE_PANE,
	activeProfilePane,
	NEIGHBOR_PANE,
	openGridProfile,
	PAGER_STOP,
	pagerGeometry,
	PANE,
	PROFILE_PAGER,
	profilePager,
	profileUrl,
	restsOn,
	swipeProfile,
	swipeToNext,
} from "./support/profile-pager";

test.describe.configure({ timeout: 300_000 });

function paneSelector({ position }: { position: number }): string {
	return `${PANE}[style*="left: ${position * 100}%"]`;
}

function paneAt(page: Page, { position }: { position: number }) {
	return page.locator(paneSelector({ position }));
}

async function pagerHeldAt(page: Page, { fraction }: { fraction: number }) {
	const { width } = await pagerGeometry(page);
	const box = (await profilePager(page).boundingBox())!;
	const heading = (await activeProfilePane(page)
		.locator("h1")
		.boundingBox())!;
	const y = heading.y + heading.height / 2;
	const touch = await TrustedTouch.attach(page);
	await touch.drag(
		page,
		{ x: box.x + width * 0.8, y },
		{ x: box.x + width * (0.8 - fraction), y },
		{ steps: 16, holdMs: 16, release: false },
	);
	return touch;
}

test("a held finger pulls the next profile in and commits only once it lifts", async ({
	page,
}) => {
	const tiles = await openGridProfile(page, { nth: 1 });
	const { width, activePosition } = await pagerGeometry(page);
	expect(activePosition).toBe(1);
	const box = (await profilePager(page).boundingBox())!;
	const heading = (await activeProfilePane(page)
		.locator("h1")
		.boundingBox())!;
	const y = heading.y + heading.height / 2;
	const next = paneAt(page, { position: 2 });
	await next.evaluate((pane) => pane.setAttribute("data-sampled", ""));

	const touch = await TrustedTouch.attach(page);
	await touch.start(box.x + width * 0.75, y);
	let x = 0.75;
	const samples = [];
	for (const fraction of [0.5, 0.35, 0.15]) {
		for (let step = 1; step <= 6; step++)
			await touch.move(
				box.x + width * (x + ((fraction - x) * step) / 6),
				y,
			);
		x = fraction;
		await afterTwoFrames(page);
		samples.push(
			await page.evaluate(
				({ pagerSelector }) => {
					const pager = document.querySelector(pagerSelector)!;
					const pane = pager.querySelector("[data-sampled]")!;
					return {
						scrollLeft: pager.scrollLeft,
						paneLeft:
							pane.getBoundingClientRect().left -
							pager.getBoundingClientRect().left,
						pathname: location.pathname,
					};
				},
				{ pagerSelector: PROFILE_PAGER },
			),
		);
	}

	const offsets = samples.map(({ scrollLeft }) => scrollLeft);
	expect(offsets[0]).toBeGreaterThan(width);
	expect(offsets[1]).toBeGreaterThan(offsets[0]!);
	expect(offsets[2]).toBeGreaterThan(offsets[1]!);
	for (const { scrollLeft, paneLeft, pathname } of samples) {
		expect(Math.abs(paneLeft - (2 * width - scrollLeft))).toBeLessThan(2);
		expect(pathname).toBe(`/profile/${tiles[1]}`);
	}

	await touch.end();

	await expect(page).toHaveURL(profileUrl(tiles[2]!));
	await restsOn(page, { position: 2 });
	await expect(page.locator(`${ACTIVE_PANE}[data-sampled]`)).toHaveCount(1);
});

test("a finger held between two profiles never commits", async ({ page }) => {
	const tiles = await openGridProfile(page, { nth: 1 });

	const touch = await pagerHeldAt(page, { fraction: 0.6 });
	const held = await pagerGeometry(page);
	expect(held.scrollLeft).toBeGreaterThan(held.width * 1.3);
	for (let sample = 0; sample < 10; sample++) {
		await page.waitForTimeout(100);
		const { scrollLeft } = await pagerGeometry(page);
		expect(Math.abs(scrollLeft - held.scrollLeft)).toBeLessThanOrEqual(1);
		expect(new URL(page.url()).pathname).toBe(`/profile/${tiles[1]}`);
	}

	await touch.end();

	await expect(page).toHaveURL(profileUrl(tiles[2]!));
	await restsOn(page, { position: 2 });
});

test("a drag that starts on the photo pages too", async ({ page }) => {
	const tiles = await openGridProfile(page, { nth: 1 });

	await swipeProfile(page, {
		on: activeProfilePane(page).locator(".carousel"),
	});

	await expect(page).toHaveURL(profileUrl(tiles[2]!));
	await restsOn(page, { position: 2 });
});

test("nothing on screen moves when a swipe commits", async ({ page }) => {
	const tiles = await openGridProfile(page, { nth: 1 });
	const touch = await pagerHeldAt(page, { fraction: 0.6 });
	const frames = page.evaluate(
		({ pagerSelector, stopSelector, landedSelector }) => {
			const pager = document.querySelector(pagerSelector)!;
			const landed = pager.querySelector<HTMLElement>(landedSelector)!;
			const samples: {
				scrollLeft: number;
				landedLeft: number;
				stops: number;
				heroShown: boolean;
			}[] = [];
			return new Promise<typeof samples>((resolve) => {
				const sample = () => {
					const hero =
						landed.querySelector<HTMLImageElement>(".carousel img");
					samples.push({
						scrollLeft: pager.scrollLeft,
						landedLeft: landed.getBoundingClientRect().left,
						stops: pager.querySelectorAll(stopSelector).length,
						heroShown:
							hero !== null &&
							hero.complete &&
							hero.naturalWidth > 0,
					});
					if (samples.length < 90) requestAnimationFrame(sample);
					else resolve(samples);
				};
				requestAnimationFrame(sample);
			});
		},
		{
			pagerSelector: PROFILE_PAGER,
			stopSelector: PAGER_STOP,
			landedSelector: paneSelector({ position: 2 }),
		},
	);
	await page.waitForTimeout(50);
	await touch.end();
	const samples = await frames;

	await expect(page).toHaveURL(profileUrl(tiles[2]!));
	const { width } = await pagerGeometry(page);
	const aligned = samples.findIndex(
		({ scrollLeft }) => scrollLeft === 2 * width,
	);
	expect(aligned).toBeGreaterThan(0);
	expect(aligned).toBeLessThan(60);
	const settled = samples.slice(aligned);
	expect(new Set(settled.map(({ scrollLeft }) => scrollLeft)).size).toBe(1);
	expect(new Set(settled.map(({ landedLeft }) => landedLeft)).size).toBe(1);
	expect(new Set(samples.map(({ stops }) => stops)).size).toBe(1);
	const firstShown = samples.findIndex(({ heroShown }) => heroShown);
	expect(firstShown).toBeGreaterThanOrEqual(0);
	expect(samples.slice(firstShown).every(({ heroShown }) => heroShown)).toBe(
		true,
	);
});

test("a second flick the moment the first lands carries on to the profile after", async ({
	page,
}) => {
	const tiles = await openGridProfile(page, { nth: 1 });
	const depth = await historyDepth(page);

	await swipeProfile(page);
	await restsOn(page, { position: 2 });
	await swipeProfile(page);

	await expect(page).toHaveURL(profileUrl(tiles[3]!));
	await restsOn(page, { position: 3 });
	expect(await historyDepth(page)).toBe(depth);
});

test("a short drag springs back without committing", async ({ page }) => {
	const tiles = await openGridProfile(page, { nth: 1 });
	const depth = await historyDepth(page);

	const slowerThanAFling = 60;
	await swipeProfile(page, { from: 0.6, to: 0.45, holdMs: slowerThanAFling });

	await restsOn(page, { position: 1 });
	await afterTwoFrames(page);
	expect(new URL(page.url()).pathname).toBe(`/profile/${tiles[1]}`);
	expect(await historyDepth(page)).toBe(depth);
	expect((await pagerGeometry(page)).activePosition).toBe(1);
});

test("a vertical drag scrolls the profile and does not page", async ({
	page,
}) => {
	const tiles = await openGridProfile(page, { nth: 1 });
	const { scrollLeft } = await pagerGeometry(page);
	const box = (await profilePager(page).boundingBox())!;

	const touch = await TrustedTouch.attach(page);
	await touch.drag(
		page,
		{ x: box.x + box.width / 2, y: box.y + box.height * 0.75 },
		{ x: box.x + box.width / 2, y: box.y + box.height * 0.25 },
		{ steps: 16, holdMs: 16 },
	);

	await restsOn(page, { position: 1 });
	await afterTwoFrames(page);
	expect((await pagerGeometry(page)).scrollLeft).toBe(scrollLeft);
	expect(
		await page
			.locator('[data-slot="profile-scroller"]')
			.evaluate((scroller) => scroller.scrollTop),
	).toBeGreaterThan(0);
	expect(new URL(page.url()).pathname).toBe(`/profile/${tiles[1]}`);
});

test("only the active profile is reachable, before and after a swipe", async ({
	page,
}) => {
	const tiles = await openGridProfile(page, { nth: 1 });
	const panes = page.locator(PANE);
	const neighbors = page.locator(NEIGHBOR_PANE);

	async function expectOnlyActiveReachable() {
		await expect(page.getByRole("switch")).toHaveCount(1);
		await expect(backLink(page)).toHaveCount(1);
		await expect(
			activeProfilePane(page).getByLabel("Profile menu"),
		).toHaveCount(1);
		await expect(
			page.locator('[data-slot="profile-scroller"]'),
		).toHaveCount(1);
		await expect(activeProfilePane(page)).toHaveCount(1);
		await expect(activeProfilePane(page).locator("[inert]")).toHaveCount(0);
		await expect
			.poll(() => page.locator(`${NEIGHBOR_PANE} main[inert]`).count())
			.toBe(await neighbors.count());
		expect(await neighbors.count()).toBe((await panes.count()) - 1);
	}

	await expect(neighbors).toHaveCount(2);
	await expectOnlyActiveReachable();

	await swipeToNext(page, { tiles, landing: 2 });

	await expect(neighbors).toHaveCount(2);
	await expectOnlyActiveReachable();
});

test("the first profile has nothing before it to page to", async ({ page }) => {
	const tiles = await openGridProfile(page, { nth: 0 });
	expect((await pagerGeometry(page)).scrollLeft).toBe(0);

	await swipeProfile(page, { from: 0.2, to: 0.8 });

	await restsOn(page, { position: 0 });
	await afterTwoFrames(page);
	expect(new URL(page.url()).pathname).toBe(`/profile/${tiles[0]}`);
});

test("the next profile's photo is the very image that lands", async ({
	page,
}) => {
	const tiles = await openGridProfile(page, { nth: 1 });
	const nextPhoto = paneAt(page, { position: 2 })
		.locator(".carousel img")
		.first();
	await expect
		.poll(() =>
			nextPhoto.evaluate(
				(image: HTMLImageElement) =>
					image.complete && image.naturalWidth > 0,
			),
		)
		.toBe(true);
	await nextPhoto.evaluate((image) => image.setAttribute("data-tagged", ""));
	await page.evaluate(() => {
		const image =
			document.querySelector<HTMLImageElement>("[data-tagged]")!;
		const record = { lost: false };
		Object.assign(window, { __taggedPhoto: record });
		const check = () => {
			if (
				!image.isConnected ||
				!image.complete ||
				image.naturalWidth === 0
			)
				record.lost = true;
			requestAnimationFrame(check);
		};
		requestAnimationFrame(check);
	});

	await swipeToNext(page, { tiles, landing: 2 });

	expect(
		await activeProfilePane(page)
			.locator(".carousel img")
			.first()
			.evaluate((image) => image.hasAttribute("data-tagged")),
	).toBe(true);
	expect(
		await page.evaluate(
			() =>
				(window as unknown as { __taggedPhoto: { lost: boolean } })
					.__taggedPhoto.lost,
		),
	).toBe(false);
});

test("the next profile is fully loaded before it is swiped in", async ({
	page,
}) => {
	const tiles = await openGridProfile(page, { nth: 1 });
	const next = paneAt(page, { position: 2 });

	await expect(next).toHaveAttribute("aria-hidden", "true");
	await expect(next.locator('[data-slot="profile-status-row"]')).toHaveCount(
		1,
	);
	const heading = await next.locator("h1").textContent();
	expect(heading?.trim()).not.toBe("");

	await swipeToNext(page, { tiles, landing: 2 });

	expect(await activeProfilePane(page).locator("h1").textContent()).toBe(
		heading,
	);
});
