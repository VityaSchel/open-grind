import { expect, type Locator, type Page, test } from "@playwright/test";

import { FIRST_ROUTE_COMPILE_MS, installTauriShim } from "./support/app";
import { AVATAR_HOST, holdImages, serveImages } from "./support/media";
import { activeProfilePane } from "./support/profile-pager";

type DemoProfile = { profileId: number; photos: number };

const THREE_PHOTOS: DemoProfile = { profileId: 100016, photos: 3 };
const FOUR_PHOTOS: DemoProfile = { profileId: 100004, photos: 4 };
const FIVE_PHOTOS: DemoProfile = { profileId: 100013, photos: 5 };
const FOURTH_OF_FIVE_PHOTOS = `${AVATAR_HOST}seed=${FIVE_PHOTOS.profileId}-3`;
const PHOTOS_LOADED_AT_REST = 3;

function photo(page: Page, { nth, of }: { nth: number; of: number }): Locator {
	return activeProfilePane(page).getByRole("link", {
		name: `Profile photo ${nth} of ${of}`,
		exact: true,
	});
}

function runningAnimations(page: Page): Promise<string[]> {
	return page.evaluate(() =>
		document
			.getAnimations()
			.filter((animation) => animation.playState === "running")
			.map((animation) =>
				animation instanceof CSSAnimation
					? animation.animationName
					: animation.constructor.name,
			),
	);
}

async function openProfileAtRest(
	page: Page,
	{ profileId, photos }: DemoProfile,
): Promise<void> {
	await page.goto(`/profile/${profileId}`);
	await photo(page, { nth: photos, of: photos }).waitFor({
		state: "attached",
		timeout: FIRST_ROUTE_COMPILE_MS,
	});
	for (let nth = 1; nth <= PHOTOS_LOADED_AT_REST; nth++) {
		await expect(photo(page, { nth, of: photos })).toHaveAttribute(
			"data-pswp-width",
			/\d/,
		);
	}
}

test.beforeEach(async ({ page }) => {
	test.setTimeout(180_000);
	await serveImages(page, AVATAR_HOST);
	await installTauriShim(page);
});

for (const profile of [THREE_PHOTOS, FOUR_PHOTOS, FIVE_PHOTOS]) {
	test(`a profile with ${profile.photos} photos animates nothing at rest`, async ({
		page,
	}) => {
		await openProfileAtRest(page, profile);

		await expect.poll(() => runningAnimations(page)).toEqual([]);
	});
}

test("a photo scrolled into reach spins only until it loads", async ({
	page,
}) => {
	const fourthPhoto = await holdImages(page, FOURTH_OF_FIVE_PHOTOS);
	await openProfileAtRest(page, FIVE_PHOTOS);
	await expect.poll(() => runningAnimations(page)).toEqual([]);
	expect(fourthPhoto.requested()).toBe(0);

	await photo(page, { nth: 2, of: FIVE_PHOTOS.photos }).evaluate((second) =>
		second.scrollIntoView({ behavior: "instant" }),
	);

	await expect(
		photo(page, { nth: 4, of: FIVE_PHOTOS.photos }).getByRole("status", {
			name: "Loading",
		}),
	).toBeAttached();
	await expect.poll(() => fourthPhoto.requested()).toBe(1);
	expect(await runningAnimations(page)).toEqual(["spin"]);

	await fourthPhoto.release();

	await expect.poll(() => runningAnimations(page)).toEqual([]);
});
