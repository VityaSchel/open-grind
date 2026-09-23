import { expect, type Page, test } from "@playwright/test";

import {
	backLink,
	DEMO_CONVERSATION,
	historyDepth,
	installTauriShim,
} from "./support/app";
import {
	activeProfilePane,
	openBrowse,
	openGridProfile,
	openTile,
	pagerGeometry,
	profileLoaded,
	profileUrl,
	restsOn,
	swipeProfile,
	swipeToNext,
	swipeToPrevious,
	tileIds,
} from "./support/profile-pager";

test.describe.configure({ timeout: 300_000 });

function historyIndex(page: Page): Promise<number | undefined> {
	return page.evaluate(() => navigation.currentEntry?.index);
}

async function expectSingleStop(page: Page) {
	await profileLoaded(page);
	const { stops, scrollWidth, width } = await pagerGeometry(page);
	expect(stops).toBe(1);
	expect(scrollWidth).toBe(width);
}

test("swipes replace the history entry, so Back and Browse return to the grid", async ({
	page,
}) => {
	const tiles = await openGridProfile(page, { nth: 1 });
	const depth = await historyDepth(page);
	const index = await historyIndex(page);

	await swipeToNext(page, { tiles, landing: 2 });
	await swipeToNext(page, { tiles, landing: 3 });

	expect(await historyDepth(page)).toBe(depth);
	expect(await historyIndex(page)).toBe(index);

	await backLink(page).click();
	await expect(page).toHaveURL(/localhost:\d+\/$/);

	await openTile(page, { tiles, nth: 1 });
	await swipeToNext(page, { tiles, landing: 2 });
	await page.getByRole("link", { name: "Browse" }).click();

	await expect(page).toHaveURL(/localhost:\d+\/$/);
	expect(await historyDepth(page)).toBe(depth);
});

test("a profile opened by link stands alone", async ({ page }) => {
	await installTauriShim(page);
	await page.goto("/profile/100002");

	await expectSingleStop(page);
});

test("a profile opened from a chat stands alone", async ({ page }) => {
	await installTauriShim(page);
	await page.goto(DEMO_CONVERSATION);
	const avatar = page.locator('a[href^="/profile/"]:visible').first();
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

	await backLink(page).click();
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

	await backLink(page).click();
	await expect(page).toHaveURL(/localhost:\d+\/$/);

	await expect
		.poll(async () => {
			const rect = await tileRect(page, target!.id);
			return rect.y + rect.height <= band.bottom + 1;
		})
		.toBe(true);
	expect(await tileIds(page)).toContain(target!.id);
});
