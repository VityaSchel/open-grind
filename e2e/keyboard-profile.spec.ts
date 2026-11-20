import { expect, type Locator, type Page, test } from "@playwright/test";

import { FIRST_ROUTE_COMPILE_MS, installTauriShim } from "./support/app";
import { arrowThrough, focusProblems } from "./support/focus";
import {
	activeProfilePane,
	openGridProfile,
	profileUrl,
	restsOn,
} from "./support/profile-pager";

const DEMO_PROFILE = "/profile/100001";
const DEMO_PROFILE_PHOTOS = 3;
const PHOTO = '[data-slot="image-carousel-item"]';

function isFocused(target: Locator): Promise<boolean> {
	return target.evaluate((node) => node === document.activeElement);
}

function lightboxSlide(page: Page): Promise<number | null> {
	return page.evaluate(() => {
		const { pswp } = window as {
			pswp?: { currIndex: number; opener: { isOpen: boolean } };
		};
		return pswp?.opener.isOpen ? pswp.currIndex : null;
	});
}

async function focusFromKeyboard(target: Locator): Promise<void> {
	await target.focus();
	await target.page().keyboard.press("Tab");
	await target.page().keyboard.press("Shift+Tab");
}

function focusInside(target: Locator): Promise<boolean> {
	return target.evaluateAll((nodes) =>
		nodes.some((node) => node.contains(document.activeElement)),
	);
}

test.use({ viewport: { width: 1280, height: 800 }, hasTouch: false });
test.describe.configure({ timeout: 300_000 });

test.describe("the profile photo carousel", () => {
	test.beforeEach(async ({ page }) => {
		await installTauriShim(page, { platform: "macos" });
		await page.goto(DEMO_PROFILE);
		await activeProfilePane(page)
			.locator(PHOTO)
			.nth(DEMO_PROFILE_PHOTOS - 1)
			.waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });
	});

	test("walks every photo with the down arrow, visibly", async ({ page }) => {
		const photos = activeProfilePane(page).locator(PHOTO);
		const stops = await arrowThrough(page, {
			start: photos.first(),
			key: "ArrowDown",
			stops: DEMO_PROFILE_PHOTOS + 2,
		});
		expect(stops).toHaveLength(DEMO_PROFILE_PHOTOS);
		expect(focusProblems(stops)).toEqual([]);
	});

	test("jumps to the last and first photos with End and Home", async ({
		page,
	}) => {
		const photos = activeProfilePane(page).locator(PHOTO);
		await photos.first().focus();
		await page.keyboard.press("End");
		expect(await isFocused(photos.last())).toBe(true);
		await page.keyboard.press("Home");
		expect(await isFocused(photos.first())).toBe(true);
	});

	test("is one Tab stop that remembers the last photo", async ({ page }) => {
		const photos = activeProfilePane(page).locator(PHOTO);
		await photos.first().focus();
		await page.keyboard.press("ArrowDown");
		await page.keyboard.press("Tab");
		expect(await focusInside(photos)).toBe(false);
		await page.keyboard.press("Shift+Tab");
		expect(await isFocused(photos.nth(1))).toBe(true);
		await page.keyboard.press("Shift+Tab");
		expect(await focusInside(photos)).toBe(false);
	});

	test("returns focus to the photo the lightbox closed on", async ({
		page,
	}) => {
		const photos = activeProfilePane(page).locator(PHOTO);
		await photos.first().focus();
		await page.keyboard.press("Enter");
		await expect
			.poll(() => lightboxSlide(page), { timeout: 30_000 })
			.toBe(0);
		await page.keyboard.press("ArrowRight");
		await expect.poll(() => lightboxSlide(page)).toBe(1);
		await page.keyboard.press("Escape");
		await page.locator(".pswp").waitFor({ state: "detached" });
		await expect.poll(() => isFocused(photos.nth(1))).toBe(true);
		await expect(photos.first()).toBeVisible();
		await expect(photos.nth(1)).toBeVisible();
	});
});

test.describe("the favorite note editor", () => {
	test("opened with the mouse, puts the caret in the note", async ({
		page,
	}) => {
		await installTauriShim(page, { platform: "macos" });
		await page.goto(DEMO_PROFILE);
		const addNote = activeProfilePane(page).getByRole("button", {
			name: "Add note",
		});
		await addNote.waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });

		await addNote.click();

		await expect(
			page.getByRole("dialog").getByRole("textbox").first(),
		).toBeFocused();
	});
});

test.describe("paging profiles from the keyboard", () => {
	const menu = (pane: Locator) =>
		pane.getByRole("button", { name: "Profile menu" });

	test("moves focus from a photo to the next profile's photos", async ({
		page,
	}) => {
		const tiles = await openGridProfile(page, {
			nth: 1,
			platform: "macos",
		});
		await focusFromKeyboard(activeProfilePane(page).locator(PHOTO).first());
		await page.keyboard.press("End");
		await page.keyboard.press("ArrowRight");
		await restsOn(page, { position: 2 });
		await expect(page).toHaveURL(profileUrl(tiles[2]!));
		await expect
			.poll(() =>
				isFocused(activeProfilePane(page).locator(PHOTO).first()),
			)
			.toBe(true);
	});

	test("keeps focus on the favorite toggle between a favorite and a non-favorite", async ({
		page,
	}) => {
		const tiles = await openGridProfile(page, {
			nth: 1,
			platform: "macos",
		});
		const favorite = activeProfilePane(page);
		await favorite
			.getByRole("switch", { name: "Add to favorites" })
			.click();
		await favorite.getByRole("button", { name: "Add note" }).waitFor();
		await focusFromKeyboard(
			favorite.getByRole("switch", { name: "Remove from favorites" }),
		);
		await page.keyboard.press("ArrowRight");
		await restsOn(page, { position: 2 });
		await expect(page).toHaveURL(profileUrl(tiles[2]!));
		const next = activeProfilePane(page);
		await expect(
			next.getByRole("button", { name: "Add note" }),
		).toHaveCount(0);
		await expect
			.poll(() =>
				isFocused(
					next.getByRole("switch", { name: "Add to favorites" }),
				),
			)
			.toBe(true);
		await page.keyboard.press("ArrowLeft");
		await restsOn(page, { position: 1 });
		await expect(page).toHaveURL(profileUrl(tiles[1]!));
		await expect
			.poll(() =>
				isFocused(
					activeProfilePane(page).getByRole("switch", {
						name: "Remove from favorites",
					}),
				),
			)
			.toBe(true);
	});

	test("moves focus from the menu button to the next profile's", async ({
		page,
	}) => {
		const tiles = await openGridProfile(page, {
			nth: 1,
			platform: "macos",
		});
		await focusFromKeyboard(menu(activeProfilePane(page)));
		await page.keyboard.press("ArrowRight");
		await restsOn(page, { position: 2 });
		await expect(page).toHaveURL(profileUrl(tiles[2]!));
		await expect
			.poll(() => isFocused(menu(activeProfilePane(page))))
			.toBe(true);
	});
});
