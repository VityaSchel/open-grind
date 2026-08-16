import { expect, type Page, test } from "@playwright/test";

import { ensureGridLocation, installTauriShim } from "./support/app";

const GRID_CARD = '.photo-grid a[href^="/profile/"]';

async function openFirstGridProfile(page: Page): Promise<string> {
	await installTauriShim(page);
	await page.goto("/");
	await page.locator("nav a").first().waitFor({ timeout: 120_000 });
	await ensureGridLocation(page);

	const cards = page.locator(GRID_CARD);
	await cards.first().waitFor({ timeout: 60_000 });
	const href = await cards.first().getAttribute("href");
	await cards.first().click();
	await expect(page).toHaveURL(new RegExp(`${href}$`));
	return href!;
}

test("hiding a profile takes it off the grid and offers an undo", async ({
	page,
}) => {
	test.setTimeout(240_000);
	const href = await openFirstGridProfile(page);

	await page.getByLabel("Profile menu").click();
	await page.getByRole("menuitem", { name: "Hide profile" }).click();

	await expect(page.getByText("You hid this profile.")).toBeVisible();
	await expect(page.getByText("You have blocked this profile.")).toHaveCount(
		0,
	);
	await expect(page.getByText("This person has blocked you.")).toHaveCount(0);

	await page.goBack();
	await expect(page).toHaveURL(/\/$/);
	await expect(page.locator(`${GRID_CARD}[href="${href}"]`)).toHaveCount(0);
});

test("unhiding from the profile brings the profile back", async ({ page }) => {
	test.setTimeout(240_000);
	await openFirstGridProfile(page);

	await page.getByLabel("Profile menu").click();
	await page.getByRole("menuitem", { name: "Hide profile" }).click();
	await expect(page.getByText("You hid this profile.")).toBeVisible();

	await page.getByRole("button", { name: "Unhide" }).click();

	await expect(page.getByText("You hid this profile.")).toHaveCount(0);
	await expect(page.getByLabel("Profile menu")).toBeVisible();
});
