import { expect, test } from "@playwright/test";

import { afterTwoFrames, historyDepth } from "./support/app";
import {
	activeProfilePane,
	openGridProfile,
	pagerGeometry,
	profileUrl,
	restsOn,
} from "./support/profile-pager";

test.describe.configure({ timeout: 300_000 });

test("arrow keys page between profiles", async ({ page }) => {
	const tiles = await openGridProfile(page, { nth: 1 });
	const depth = await historyDepth(page);

	await page.keyboard.press("ArrowRight");
	await restsOn(page, { position: 2 });
	await expect(page).toHaveURL(profileUrl(tiles[2]!));

	await page.keyboard.press("ArrowLeft");
	await restsOn(page, { position: 1 });
	await expect(page).toHaveURL(profileUrl(tiles[1]!));
	expect(
		await historyDepth(page),
		"arrow keys replace the entry like a swipe",
	).toBe(depth);
});

test("arrow keys leave the profile alone while the lightbox is opening", async ({
	page,
}) => {
	await openGridProfile(page, { nth: 1 });
	const before = (await pagerGeometry(page)).scrollLeft;

	await activeProfilePane(page).locator("a.item").first().click();
	await page.locator(".pswp--open").waitFor({ timeout: 30_000 });
	await page.evaluate(() => {
		addEventListener(
			"keydown",
			(event) => {
				document.body.dataset.arrowCancelled = String(
					event.defaultPrevented,
				);
			},
			{ once: true },
		);
	});
	await page.keyboard.press("ArrowRight");

	await expect(
		page.locator("body"),
		"the browser must not scroll the pager behind the lightbox",
	).toHaveAttribute("data-arrow-cancelled", "true");
	await page.waitForTimeout(600);
	expect((await pagerGeometry(page)).scrollLeft).toBe(before);
});

test("arrow keys leave the profile alone while a menu is open", async ({
	page,
}) => {
	await openGridProfile(page, { nth: 1 });

	await activeProfilePane(page).getByLabel("Profile menu").click();
	await page.getByRole("menuitem").first().waitFor({ timeout: 30_000 });
	const { scrollLeft } = await pagerGeometry(page);

	await page.keyboard.press("ArrowRight");
	await afterTwoFrames(page);

	expect(
		(await pagerGeometry(page)).scrollLeft,
		"the menu owns the arrows",
	).toBe(scrollLeft);
});
