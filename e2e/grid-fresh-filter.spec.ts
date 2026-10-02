import { expect, type Page, test } from "@playwright/test";

import {
	ensureGridLocation,
	FIRST_ROUTE_COMPILE_MS,
	installTauriShim,
} from "./support/app";
import {
	installPersistentAppData,
	storedPreferences,
} from "./support/app-data";

const PROFILE_LINK = '[data-slot="grid-cells"] a[href^="/profile/"]';

const shownProfiles = (page: Page) =>
	page
		.locator(PROFILE_LINK)
		.evaluateAll((links) => links.map((link) => link.getAttribute("href")));

test("Fresh in the filter sheet narrows the grid and stays in step with the top bar toggle", async ({
	page,
}) => {
	test.setTimeout(180_000);
	await installTauriShim(page);
	await installPersistentAppData(page);
	await page.goto("/");
	await page
		.locator("nav a")
		.first()
		.waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });
	await ensureGridLocation(page);
	await page.locator(PROFILE_LINK).first().waitFor({ timeout: 60_000 });
	const everyone = await shownProfiles(page);

	const allFilters = page.getByRole("button", { name: "All filters" });
	const apply = page.getByRole("button", { name: "Apply" });
	const freshRow = page.getByRole("checkbox", { name: "Fresh", exact: true });
	const freshToggle = page.getByRole("button", {
		name: "Fresh",
		exact: true,
	});

	await allFilters.click();
	await expect(freshRow).not.toBeChecked();
	await freshRow.click();
	await expect(freshRow).toBeChecked();
	await apply.click();

	await expect(freshToggle).toHaveAttribute("aria-pressed", "true");
	await expect
		.poll(async () => {
			const preferences = await storedPreferences(page);
			const filters = preferences?.gridSearchFilters as
				| { isFresh: boolean }
				| undefined;
			return filters?.isFresh;
		})
		.toBe(true);
	await expect
		.poll(async () => {
			const shown = await shownProfiles(page);
			return (
				shown.length > 0 &&
				everyone.some((profile) => !shown.includes(profile))
			);
		})
		.toBe(true);

	await freshToggle.click();

	await expect(freshToggle).toHaveAttribute("aria-pressed", "false");
	await expect
		.poll(async () => {
			const shown = await shownProfiles(page);
			return everyone.filter((profile) => !shown.includes(profile));
		})
		.toEqual([]);
	await allFilters.click();
	await apply.waitFor();
	await expect(freshRow).not.toBeChecked();
});
