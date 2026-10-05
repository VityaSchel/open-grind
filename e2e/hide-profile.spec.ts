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

async function hideTwoFromGrid(
	page: Page,
): Promise<{ hiddenFirst: string; hiddenLast: string }> {
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
	return { hiddenFirst, hiddenLast };
}

const HIDDEN_ROWS = '[data-slot="subpage-scroller"] a[href^="/profile/"]';

async function expectHiddenList({
	page,
	hrefs,
}: {
	page: Page;
	hrefs: string[];
}) {
	const rows = page.locator(HIDDEN_ROWS);
	await expect(rows).toHaveCount(hrefs.length, { timeout: 60_000 });
	for (const [index, href] of hrefs.entries())
		await expect(rows.nth(index)).toHaveAttribute("href", href);
}

test("the hidden list shows the most recently hidden first", async ({
	page,
}) => {
	test.setTimeout(240_000);
	const { hiddenFirst, hiddenLast } = await hideTwoFromGrid(page);

	await clickMeTab(page);
	await page.getByRole("link", { name: "Account Settings" }).click();
	await page.getByRole("link", { name: "Hidden users" }).click();

	await expectHiddenList({ page, hrefs: [hiddenLast, hiddenFirst] });
});

test("hiding again from the hidden list moves the profile to the top", async ({
	page,
}) => {
	test.setTimeout(240_000);
	const { hiddenFirst, hiddenLast } = await hideTwoFromGrid(page);
	await clickMeTab(page);
	await page.getByRole("link", { name: "Account Settings" }).click();
	await page.getByRole("link", { name: "Hidden users" }).click();
	await expectHiddenList({ page, hrefs: [hiddenLast, hiddenFirst] });

	const toggle = page
		.locator('[data-slot="subpage-scroller"]')
		.getByRole("switch")
		.nth(1);
	await toggle.click();
	await expect(toggle).toHaveAttribute("aria-checked", "false");
	await toggle.click();
	await expect(toggle).toHaveAttribute("aria-checked", "true");

	await page.goBack();
	await page.getByRole("link", { name: "Hidden users" }).click();

	await expectHiddenList({ page, hrefs: [hiddenFirst, hiddenLast] });
});
