import { expect, type Page, test } from "@playwright/test";

import { ensureGridLocation, installTauriShim } from "./support/app";
import { clickMeTab } from "./support/page-stack";
import { activeProfilePane } from "./support/profile-pager";

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

async function hideActiveProfile(page: Page) {
	await activeProfilePane(page).getByLabel("Profile menu").click();
	await page.getByRole("menuitem", { name: "Hide profile" }).click();
	await expect(page.getByText("You hid this profile.")).toBeVisible();
}

test("hiding a profile takes it off the grid and offers an undo", async ({
	page,
}) => {
	test.setTimeout(240_000);
	const href = await openFirstGridProfile(page);

	await hideActiveProfile(page);
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

	await hideActiveProfile(page);

	await activeProfilePane(page)
		.getByRole("button", { name: "Unhide" })
		.click();

	await expect(page.getByText("You hid this profile.")).toHaveCount(0);
	await expect(
		activeProfilePane(page).getByLabel("Profile menu"),
	).toBeVisible();
});

test("the hidden list shows the most recently hidden first", async ({
	page,
}) => {
	test.setTimeout(240_000);
	const hiddenFirst = await openFirstGridProfile(page);
	await hideActiveProfile(page);
	await page.goBack();
	await expect(
		page.locator(`${GRID_CARD}[href="${hiddenFirst}"]`),
	).toHaveCount(0);

	const nextCard = page.locator(GRID_CARD).first();
	const hiddenLast = (await nextCard.getAttribute("href"))!;
	await nextCard.click();
	await expect(page).toHaveURL(new RegExp(`${hiddenLast}$`));
	await hideActiveProfile(page);

	await clickMeTab(page);
	await page.getByRole("link", { name: "Account Settings" }).click();
	await page.getByRole("link", { name: "Hidden users" }).click();

	const rows = page.locator(
		'[data-slot="subpage-scroller"] a[href^="/profile/"]',
	);
	await expect(rows).toHaveCount(2, { timeout: 60_000 });
	await expect(rows.nth(0)).toHaveAttribute("href", hiddenLast);
	await expect(rows.nth(1)).toHaveAttribute("href", hiddenFirst);
});
