import { expect, type Page, test } from "@playwright/test";

import {
	DEMO_CONVERSATION,
	installTauriShim,
	TrustedTouch,
} from "./support/app";
import {
	ACTIVE_PANE,
	activeProfilePane,
	afterTwoFrames,
	NEIGHBOR_PANE,
	openBrowse,
	openGridProfile,
	openTile,
	PAGER_STOP,
	pagerGeometry,
	PANE,
	PROFILE_PAGER,
	profileLoaded,
	profilePager,
	profileUrl,
	restsOn,
	swipeProfile,
	swipeToNext,
	swipeToPrevious,
	tileIds,
} from "./support/profile-pager";

test.describe.configure({ timeout: 300_000 });

function historyLength(page: Page): Promise<number> {
	return page.evaluate(() => history.length);
}

function historyIndex(page: Page): Promise<number | undefined> {
	return page.evaluate(() => navigation.currentEntry?.index);
}

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
	const depth = await historyLength(page);

	await swipeProfile(page);
	await restsOn(page, { position: 2 });
	await swipeProfile(page);

	await expect(page).toHaveURL(profileUrl(tiles[3]!));
	await restsOn(page, { position: 3 });
	expect(await historyLength(page)).toBe(depth);
});

test("swipes replace the history entry, so Back and Browse return to the grid", async ({
	page,
}) => {
	const tiles = await openGridProfile(page, { nth: 1 });
	const depth = await historyLength(page);
	const index = await historyIndex(page);

	await swipeToNext(page, { tiles, landing: 2 });
	await swipeToNext(page, { tiles, landing: 3 });

	expect(await historyLength(page)).toBe(depth);
	expect(await historyIndex(page)).toBe(index);

	await page.getByRole("link", { name: "Back", exact: true }).click();
	await expect(page).toHaveURL(/localhost:\d+\/$/);

	await openTile(page, { tiles, nth: 1 });
	await swipeToNext(page, { tiles, landing: 2 });
	await page.getByRole("link", { name: "Browse" }).click();

	await expect(page).toHaveURL(/localhost:\d+\/$/);
	expect(await historyLength(page)).toBe(depth);
});

test("a short drag springs back without committing", async ({ page }) => {
	const tiles = await openGridProfile(page, { nth: 1 });
	const depth = await historyLength(page);

	const slowerThanAFling = 60;
	await swipeProfile(page, { from: 0.6, to: 0.45, holdMs: slowerThanAFling });

	await restsOn(page, { position: 1 });
	await afterTwoFrames(page);
	expect(new URL(page.url()).pathname).toBe(`/profile/${tiles[1]}`);
	expect(await historyLength(page)).toBe(depth);
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
		await expect(
			page.getByRole("link", { name: "Back", exact: true }),
		).toHaveCount(1);
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

async function expectSingleStop(page: Page) {
	await profileLoaded(page);
	const { stops, scrollWidth, width } = await pagerGeometry(page);
	expect(stops).toBe(1);
	expect(scrollWidth).toBe(width);
}

test("a profile opened by link stands alone", async ({ page }) => {
	await installTauriShim(page);
	await page.goto("/profile/100002");

	await expectSingleStop(page);
});

test("a profile opened from a chat stands alone", async ({ page }) => {
	await installTauriShim(page);
	await page.goto(DEMO_CONVERSATION);
	const avatar = page.locator('a[href^="/profile/"]').first();
	await avatar.waitFor({ timeout: 180_000 });
	await avatar.click();

	await expectSingleStop(page);
});

test("a profile opened from Taps stands alone", async ({ page }) => {
	await installTauriShim(page);
	await page.goto("/interest/taps");
	const tap = page.locator('a[href^="/profile/"]').first();
	await tap.waitFor({ timeout: 180_000 });
	await tap.click();

	await expectSingleStop(page);
});

test("a palette hop stands alone, and Back returns to the swiped track", async ({
	page,
}) => {
	const tiles = await openGridProfile(page, { nth: 1 });
	await swipeToNext(page, { tiles, landing: 2 });

	await page.keyboard.press("ControlOrMeta+k");
	const palette = page.getByRole("combobox");
	await palette.waitFor();
	await palette.fill(`#${tiles[1]}`);
	await page.getByRole("option", { name: `#${tiles[1]}` }).click();
	await expect(page).toHaveURL(profileUrl(tiles[1]!));
	await expectSingleStop(page);

	await page.goBack();

	await expect(page).toHaveURL(profileUrl(tiles[2]!));
	await profileLoaded(page);
	await restsOn(page, { position: 2 });
	expect((await pagerGeometry(page)).stops).toBeGreaterThan(3);
});

test("coming back from a chat keeps the swipe track", async ({ page }) => {
	const tiles = await openGridProfile(page, { nth: 1 });

	await activeProfilePane(page)
		.getByRole("link", { name: "Write a message..." })
		.click();
	await expect(page).toHaveURL(/\/chat\//);
	await page.goBack();

	await expect(page).toHaveURL(profileUrl(tiles[1]!));
	await profileLoaded(page);
	await restsOn(page, { position: 1 });
	expect((await pagerGeometry(page)).stops).toBeGreaterThan(3);
	await swipeToNext(page, { tiles, landing: 2 });
});

test("a profile hidden from the pager keeps its place", async ({ page }) => {
	const tiles = await openGridProfile(page, { nth: 1 });

	await activeProfilePane(page)
		.getByRole("button", { name: "Profile menu" })
		.click();
	await page.getByRole("menuitem", { name: "Hide profile" }).click();
	await expect(page.getByText("You hid this profile.")).toBeVisible();
	await expect(
		page.locator("body"),
		"the closing menu no longer blocks touches",
	).not.toHaveCSS("pointer-events", "none");

	await swipeProfile(page, {
		on: activeProfilePane(page).getByText("You hid this profile."),
	});
	await expect(page).toHaveURL(profileUrl(tiles[2]!));
	await restsOn(page, { position: 2 });

	await swipeToPrevious(page, { tiles, landing: 1 });
	await expect(
		activeProfilePane(page).getByText("You hid this profile."),
	).toBeVisible();

	await swipeProfile(page, {
		from: 0.15,
		to: 0.85,
		on: activeProfilePane(page).getByText("You hid this profile."),
	});
	await expect(page).toHaveURL(profileUrl(tiles[0]!));
	await restsOn(page, { position: 0 });
});

async function gridBand(page: Page) {
	return page.locator('[data-slot="grid-content"]').evaluate((content) => {
		const scroller = content.parentElement!.getBoundingClientRect();
		const { paddingTop, paddingBottom } = getComputedStyle(content);
		return {
			top: scroller.top + parseFloat(paddingTop),
			bottom: scroller.bottom - parseFloat(paddingBottom),
		};
	});
}

async function tileRect(page: Page, profileId: number) {
	const tile = page.locator(`.photo-grid a[href="/profile/${profileId}"]`);
	await tile.waitFor({ timeout: 30_000 });
	return (await tile.boundingBox())!;
}

test("Back reveals the last swiped profile in the grid", async ({ page }) => {
	const tiles = await openGridProfile(page, { nth: 0 });

	for (let landing = 1; landing <= 24; landing++) {
		await swipeProfile(page);
		await restsOn(page, { position: landing });
	}
	await expect(page).toHaveURL(/\/profile\/\d+$/);
	const landedId = Number(new URL(page.url()).pathname.split("/").at(-1));
	expect(landedId).not.toBe(tiles[0]);

	await page.getByRole("link", { name: "Back", exact: true }).click();
	await expect(page).toHaveURL(/localhost:\d+\/$/);

	const band = await gridBand(page);
	await expect
		.poll(async () => {
			const rect = await tileRect(page, landedId);
			return (
				rect.y >= band.top - 1 &&
				rect.y + rect.height <= band.bottom + 1
			);
		})
		.toBe(true);
});

test("Back lifts a swiped profile out from under the navigation bar", async ({
	page,
}) => {
	const tiles = await openBrowse(page);
	const band = await gridBand(page);
	const rects = await Promise.all(
		tiles.map(async (id) => ({ id, rect: await tileRect(page, id) })),
	);
	const columns = rects.filter(
		({ rect }) => rect.y === rects[0]!.rect.y,
	).length;
	const fullyVisible = rects.filter(
		({ rect }) => rect.y + rect.height <= band.bottom,
	);
	const lastRowY = Math.max(...fullyVisible.map(({ rect }) => rect.y));
	const start = rects.findIndex(({ rect }) => rect.y === lastRowY);
	const target = rects[start + columns];
	expect(target).toBeDefined();
	expect(target!.rect.y + target!.rect.height).toBeGreaterThan(band.bottom);

	await openTile(page, { tiles, nth: start });
	for (let landing = start + 1; landing <= start + columns; landing++) {
		await swipeProfile(page);
		await restsOn(page, { position: landing });
	}
	await expect(page).toHaveURL(profileUrl(target!.id));

	await page.getByRole("link", { name: "Back", exact: true }).click();
	await expect(page).toHaveURL(/localhost:\d+\/$/);

	await expect
		.poll(async () => {
			const rect = await tileRect(page, target!.id);
			return rect.y + rect.height <= band.bottom + 1;
		})
		.toBe(true);
	expect(await tileIds(page)).toContain(target!.id);
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

test("arrow keys page between profiles", async ({ page }) => {
	const tiles = await openGridProfile(page, { nth: 1 });
	const depth = await historyLength(page);

	await page.keyboard.press("ArrowRight");
	await restsOn(page, { position: 2 });
	await expect(page).toHaveURL(profileUrl(tiles[2]!));

	await page.keyboard.press("ArrowLeft");
	await restsOn(page, { position: 1 });
	await expect(page).toHaveURL(profileUrl(tiles[1]!));
	expect(
		await historyLength(page),
		"arrow keys replace the entry like a swipe",
	).toBe(depth);
});

test("arrow keys leave the profile alone while the lightbox is open", async ({
	page,
}) => {
	const tiles = await openGridProfile(page, { nth: 1 });

	await activeProfilePane(page).locator("a.item").first().click();
	await page.locator(".pswp--open").waitFor({ timeout: 30_000 });

	await page.keyboard.press("ArrowRight");
	await afterTwoFrames(page);

	await expect(page, "the lightbox owns the arrows").toHaveURL(
		profileUrl(tiles[1]!),
	);
	expect((await pagerGeometry(page)).activePosition).toBe(1);
});

test("arrow keys leave the profile alone while a menu is open", async ({
	page,
}) => {
	const tiles = await openGridProfile(page, { nth: 1 });

	await activeProfilePane(page).getByLabel("Profile menu").click();
	await page.getByRole("menuitem").first().waitFor({ timeout: 30_000 });

	await page.keyboard.press("ArrowRight");
	await afterTwoFrames(page);

	await expect(page, "the menu owns the arrows").toHaveURL(
		profileUrl(tiles[1]!),
	);
	expect((await pagerGeometry(page)).activePosition).toBe(1);
});
