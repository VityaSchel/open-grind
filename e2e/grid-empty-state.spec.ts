import { expect, test } from "@playwright/test";

import {
	ensureGridLocation,
	installTauriShim,
	runPaletteCommand,
} from "./support/app";

const PROFILE_LINK = '.photo-grid a[href^="/profile/"]';
const NO_DEMO_PROFILE_AGE = "age=90-99";

test.beforeEach(async ({ page }) => {
	test.setTimeout(180_000);
	await installTauriShim(page);
	await page.goto("/");
	await page.locator("nav a").first().waitFor({ timeout: 120_000 });
	await ensureGridLocation(page);
	await page.locator(PROFILE_LINK).first().waitFor({ timeout: 60_000 });
});

test("favorites that match no other filter say so, and reset brings profiles back", async ({
	page,
}) => {
	await runPaletteCommand(page, `?favorites=true&${NO_DEMO_PROFILE_AGE}`);

	await expect(page.getByText("No Results")).toBeVisible();
	await expect(
		page.getByText("No favorites match these filters."),
	).toBeVisible();
	await expect(page.locator(PROFILE_LINK)).toHaveCount(0);

	await page.getByRole("button", { name: "Reset filters" }).click();

	await expect(page.locator(PROFILE_LINK).first()).toBeVisible();
});

test("filters that match nothing without favorites keep the general copy", async ({
	page,
}) => {
	await runPaletteCommand(page, `?${NO_DEMO_PROFILE_AGE}`);

	await expect(page.getByText("No Profiles Found")).toBeVisible();
	await expect(
		page.getByText("No favorites match these filters."),
	).toHaveCount(0);
});
