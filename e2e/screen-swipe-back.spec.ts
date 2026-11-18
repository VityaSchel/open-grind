import { expect, type Locator, type Page, test } from "@playwright/test";

import { DEV_SERVER_URL } from "../playwright.config";
import {
	afterTwoFrames,
	FIRST_ROUTE_COMPILE_MS,
	installTauriShim,
	meTab,
} from "./support/app";
import {
	APP_SETTINGS,
	openAppSettings,
	openSettings,
	OUTSIDE_SCREEN_GHOSTS,
	pane,
	SCREEN_HOST,
	screenGhost,
	screenSettled,
	SETTINGS,
	stackSettled,
} from "./support/page-stack";
import {
	activeProfilePane,
	openBrowse,
	openTile,
	PROFILE_PAGER,
	profileUrl,
} from "./support/profile-pager";
import { PHONE, resumeSlides } from "./support/stack-layers";
import {
	commitSystemBack,
	edgeSwipeZone,
	expectEdgeSwipeArmed,
	expectEdgeSwipeStaysOff,
	progressEdgeSwipe,
	progressSystemBack,
	releaseEdgeSwipe,
	startEdgeSwipe,
	startEdgeSwipeUnarmed,
	startSystemBack,
} from "./support/system-back";

test.describe.configure({ timeout: 180_000 });
test.use({ viewport: PHONE });

const BROWSE = /\/$/;
const LANGUAGE = `${APP_SETTINGS}/language`;
const EDIT_PROFILE = /\/settings\/profile$/;
const DEEP_LINKED_PROFILE = 100004;
const GRID_CONTENT = '[data-slot="grid-content"]';
const PROFILE_FIELD = '[data-slot="profile-field"]';
const CAROUSEL_ITEM = ".carousel .item[href]";
const LIGHTBOX = ".pswp";

const profileLink = (id: number) => `a[href="/profile/${id}"]`;
const gridTile = (id: number) => `.photo-grid ${profileLink(id)}`;
const liveProfilePager = (page: Page) =>
	page.locator(`${PROFILE_PAGER}${OUTSIDE_SCREEN_GHOSTS}`);
const leftEdge = (locator: Locator) =>
	locator.evaluate((element) => element.getBoundingClientRect().x);
const menu = (page: Page) => page.getByRole("menu");
const displayName = (page: Page) =>
	page.getByRole("textbox", { name: "Display name" });

async function openProfileFromBrowse(
	page: Page,
	{ platform }: { platform: "ios" | "android" },
) {
	const tiles = await openBrowse(page, { platform });
	const neighbor =
		(await page.locator(gridTile(tiles[1]!)).textContent()) ?? "";
	await openTile(page, { tiles, nth: 0 });
	return { tiles, neighbor };
}

async function expectGridPictured(
	page: Page,
	{ tiles, neighbor }: { tiles: number[]; neighbor: string },
) {
	await expect(screenGhost(page)).toBeVisible();
	await expect(screenGhost(page).locator(GRID_CONTENT)).toHaveCount(1);
	await expect(screenGhost(page).locator(profileLink(tiles[1]!))).toHaveText(
		neighbor,
	);
}

async function expectBackOnBrowse(page: Page) {
	await expect(page).toHaveURL(BROWSE);
	await screenSettled(page);
	await expect(screenGhost(page)).toHaveCount(0);
	await expect(page.locator(GRID_CONTENT)).toBeVisible();
}

async function firstTileWithPhoto(
	page: Page,
	{ tiles }: { tiles: number[] },
): Promise<number> {
	const href = await page
		.locator('.photo-grid a[href^="/profile/"]:has(img)')
		.first()
		.getAttribute("href");
	return tiles.indexOf(Number(href?.split("/").at(-1)));
}

function lightboxOpen(page: Page) {
	return page.evaluate(
		() =>
			(window as { pswp?: { opener: { isOpen: boolean } } }).pswp?.opener
				.isOpen === true,
	);
}

test.describe("the iOS edge swipe on a profile opened from Browse", () => {
	test("follows the finger over a picture of the grid and lets go onto Browse", async ({
		page,
	}) => {
		const { tiles, neighbor } = await openProfileFromBrowse(page, {
			platform: "ios",
		});
		await expectEdgeSwipeArmed(page, { armed: true });
		expect(await edgeSwipeZone(page)).toBe("goes-back");
		await expect(screenGhost(page)).toHaveCount(1);
		await expect(
			screenGhost(page),
			"the picture waits unseen",
		).toBeHidden();
		const atRest = await leftEdge(liveProfilePager(page));

		expect(await startEdgeSwipe(page)).toBe(true);
		await progressEdgeSwipe(page, 0.5);
		await expectGridPictured(page, { tiles, neighbor });
		expect(await leftEdge(liveProfilePager(page))).toBeCloseTo(
			atRest + PHONE.width / 2,
			0,
		);

		await releaseEdgeSwipe(page, { commit: true, velocity: 1 });
		await expectBackOnBrowse(page);
		await expectEdgeSwipeArmed(page, { armed: false });
	});

	test("slides the profile back in when the swipe is let go short and keeps the swipe", async ({
		page,
	}) => {
		const { tiles } = await openProfileFromBrowse(page, {
			platform: "ios",
		});
		await expectEdgeSwipeArmed(page, { armed: true });
		const atRest = await leftEdge(liveProfilePager(page));

		expect(await startEdgeSwipe(page)).toBe(true);
		await progressEdgeSwipe(page, 0.3);
		await releaseEdgeSwipe(page, { commit: false, velocity: -0.5 });

		await screenSettled(page);
		expect(await leftEdge(liveProfilePager(page))).toBe(atRest);
		await expect(page).toHaveURL(profileUrl(tiles[0]!));
		await expect(screenGhost(page)).toBeHidden();
		await expectEdgeSwipeArmed(page, { armed: true });
	});

	test("a second swipe while the first still slides out takes its Back at once", async ({
		page,
	}) => {
		const { tiles } = await openProfileFromBrowse(page, {
			platform: "ios",
		});
		await expectEdgeSwipeArmed(page, { armed: true });

		expect(await startEdgeSwipe(page)).toBe(true);
		await progressEdgeSwipe(page, 0.4);
		await page.evaluate(() => {
			window.__iosBack?.finish({ commit: true, velocity: 0 });
			for (const animation of document.getAnimations()) animation.pause();
		});
		await afterTwoFrames(page);
		await expect(page, "the held slide has not gone back yet").toHaveURL(
			profileUrl(tiles[0]!),
		);

		expect(
			await startEdgeSwipeUnarmed(page),
			"the second swipe goes back instead of starting",
		).toBe(false);
		await expect(page).toHaveURL(BROWSE);
		await resumeSlides(page);
		await expectBackOnBrowse(page);
	});

	test("stays off while the profile menu or the photo viewer holds Back", async ({
		page,
	}) => {
		const tiles = await openBrowse(page, { platform: "ios" });
		const nth = await firstTileWithPhoto(page, { tiles });
		expect(nth, "a profile on Browse has a photo").toBeGreaterThanOrEqual(
			0,
		);
		await openTile(page, { tiles, nth });
		await expectEdgeSwipeArmed(page, { armed: true });

		await activeProfilePane(page).getByLabel("Profile menu").click();
		await expect(menu(page)).toBeVisible();
		await expectEdgeSwipeArmed(page, { armed: false });
		expect(await startEdgeSwipeUnarmed(page)).toBe(false);
		await page.keyboard.press("Escape");
		await expect(menu(page)).toHaveCount(0);
		await expectEdgeSwipeArmed(page, { armed: true });

		await activeProfilePane(page).locator(CAROUSEL_ITEM).first().click();
		await expect.poll(() => lightboxOpen(page)).toBe(true);
		await expectEdgeSwipeArmed(page, { armed: false });
		expect(await startEdgeSwipeUnarmed(page)).toBe(false);
		await page.keyboard.press("Escape");
		await expect(page.locator(LIGHTBOX)).toHaveCount(0);
		await expectEdgeSwipeArmed(page, { armed: true });
	});
});

test("the iOS edge swipe stays off on a profile opened by a link", async ({
	page,
}) => {
	await installTauriShim(page, { platform: "ios" });
	await page.goto(`/profile/${DEEP_LINKED_PROFILE}`);
	await activeProfilePane(page)
		.getByRole("button", { name: "Profile menu" })
		.waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });

	await expectEdgeSwipeStaysOff(page);
	await expect(page.locator(SCREEN_HOST)).toHaveCount(0);
});

test("the iOS edge swipe goes back from Edit Profile over a picture of your profile, and from there over a picture of Settings", async ({
	page,
}) => {
	await openSettings(page, { platform: "ios" });
	await page.getByRole("link", { name: "View your profile" }).click();
	await expect(page).toHaveURL(/\/profile\/\d+$/);
	const ownProfile = new URL(page.url()).pathname;
	const editProfile = page.getByRole("link", { name: "Edit profile" });
	await editProfile.waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });
	await expect(
		activeProfilePane(page).locator(PROFILE_FIELD),
	).not.toHaveCount(0);
	await expectEdgeSwipeArmed(page, { armed: true });

	await editProfile.click();
	await expect(page).toHaveURL(EDIT_PROFILE);
	await displayName(page).waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });
	const name = await displayName(page).inputValue();
	await stackSettled(page);
	await expectEdgeSwipeArmed(page, { armed: true });
	expect(await edgeSwipeZone(page)).toBe("goes-back");
	const atRest = await leftEdge(pane(page));

	expect(await startEdgeSwipe(page)).toBe(true);
	await progressEdgeSwipe(page, 0.5);
	await expect(screenGhost(page)).toBeVisible();
	await expect(screenGhost(page)).toContainText(name);
	await expect(
		screenGhost(page).locator(PROFILE_FIELD).first(),
	).toBeVisible();
	expect(await leftEdge(pane(page))).toBeCloseTo(atRest + PHONE.width / 2, 0);

	await releaseEdgeSwipe(page, { commit: true, velocity: 1 });
	await expect(page).toHaveURL(new RegExp(`${ownProfile}$`));
	await screenSettled(page);
	await expect(editProfile).toBeVisible();
	await expect(screenGhost(page)).toBeHidden();
	await expectEdgeSwipeArmed(page, { armed: true });

	expect(await startEdgeSwipe(page)).toBe(true);
	await progressEdgeSwipe(page, 0.5);
	await expect(screenGhost(page)).toBeVisible();
	await expect(
		screenGhost(page).locator(`a[href="${APP_SETTINGS}"]`),
	).toHaveCount(1);

	await releaseEdgeSwipe(page, { commit: true, velocity: 1 });
	await expect(page).toHaveURL(new RegExp(`${SETTINGS}$`));
	await screenSettled(page);
	await expect(screenGhost(page)).toHaveCount(0);
	await expect(
		page.getByRole("link", { name: "App Settings" }),
	).toBeVisible();
	await expectEdgeSwipeArmed(page, { armed: false });
});

test.describe("the iOS edge swipe on a profile after a language change", () => {
	test.use({ baseURL: DEV_SERVER_URL });
	test.describe.configure({ timeout: 300_000 });

	test("stays off over Browse pictured in the old language until the next push pictures it in the new one", async ({
		page,
	}) => {
		const { tiles } = await openProfileFromBrowse(page, {
			platform: "ios",
		});
		await expectEdgeSwipeArmed(page, { armed: true });

		await meTab(page).click();
		await expect(page).toHaveURL(new RegExp(`${SETTINGS}$`));
		await pane(page).waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });
		await openAppSettings(page);
		await page.locator(`a[href="${LANGUAGE}"]`).click();
		await expect(page).toHaveURL(new RegExp(`${LANGUAGE}$`), {
			timeout: FIRST_ROUTE_COMPILE_MS,
		});
		await page
			.getByRole("radio", { name: "German Deutsch", exact: true })
			.click();
		await expect(page.locator("html")).toHaveAttribute("lang", "de");

		await page.evaluate(() => history.go(-3));
		await expect(page).toHaveURL(profileUrl(tiles[0]!));
		await activeProfilePane(page).waitFor();
		await expectEdgeSwipeStaysOff(page);

		await page.evaluate(() => history.back());
		await expect(page).toHaveURL(BROWSE);
		await page.locator(gridTile(tiles[1]!)).click();
		await expect(page).toHaveURL(profileUrl(tiles[1]!));
		await activeProfilePane(page).waitFor();
		await expectEdgeSwipeArmed(page, { armed: true });

		expect(await startEdgeSwipe(page)).toBe(true);
		await progressEdgeSwipe(page, 0.5);
		await expect(screenGhost(page)).toBeVisible();
		await releaseEdgeSwipe(page, { commit: true, velocity: 1 });
		await expectBackOnBrowse(page);
	});
});

test("Android's predictive back from a profile opened from Browse follows the gesture over a picture of the grid and lands on Browse", async ({
	page,
}) => {
	const { tiles, neighbor } = await openProfileFromBrowse(page, {
		platform: "android",
	});
	const atRest = await leftEdge(liveProfilePager(page));

	expect(await startSystemBack(page)).toBe(true);
	await progressSystemBack(page, 0.5);
	await expectGridPictured(page, { tiles, neighbor });
	expect(await leftEdge(liveProfilePager(page))).toBeCloseTo(
		atRest + PHONE.width / 2,
		0,
	);

	expect(await commitSystemBack(page), "the profile takes Back").toBe(false);
	await expectBackOnBrowse(page);
});
