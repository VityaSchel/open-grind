import { expect, test } from "@playwright/test";

import { ensureGridLocation, installTauriShim } from "./support/app";
import { FIRST_ROUTE_COMPILE_MS, historyDepth } from "./support/page-stack";

const TAPS = "/interest/taps";
const PROFILE_LINK = 'a[href^="/profile/"]';

test.describe.configure({ timeout: 300_000 });

test("switching interest tabs never grows history", async ({ page }) => {
	await installTauriShim(page);
	await page.goto(TAPS);
	await page
		.locator(PROFILE_LINK)
		.first()
		.waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });
	const atTaps = await historyDepth(page);

	await page.getByRole("link", { name: "Views" }).click();
	await expect(page).toHaveURL(/\/interest\/views$/);
	const atViews = await historyDepth(page);

	await page.getByRole("link", { name: "Interest", exact: true }).click();
	await expect(page).toHaveURL(new RegExp(`${TAPS}$`));
	const afterTab = await historyDepth(page);

	expect(
		[atViews, afterTab],
		`history.length went ${atTaps} -> ${atViews} -> ${afterTab}; tabs are one screen and must replace`,
	).toEqual([atTaps, atTaps]);
});

test("the Browse tab returns to the grid instead of pushing a duplicate", async ({
	page,
}) => {
	await installTauriShim(page);
	await page.goto("/");
	await page
		.locator("nav a")
		.first()
		.waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });
	await ensureGridLocation(page);
	await page.locator(PROFILE_LINK).first().waitFor({ timeout: 60_000 });

	await page.locator(PROFILE_LINK).first().click();
	await expect(page).toHaveURL(/\/profile\/\d+$/);
	const atProfile = await historyDepth(page);

	await page.getByRole("link", { name: "Browse" }).click();
	await expect(page).toHaveURL(/\/$/);

	expect(
		await historyDepth(page),
		`history.length went ${atProfile} -> ${await historyDepth(page)} tapping Browse from a profile`,
	).toBe(atProfile);
});
