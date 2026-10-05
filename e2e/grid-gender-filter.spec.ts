import { expect, type Page, test } from "@playwright/test";

import {
	ensureGridLocation,
	installTauriShim,
	runPaletteCommand,
} from "./support/app";
import {
	installPersistentAppData,
	storedPreferences,
} from "./support/app-data";

const PRIMARY_CHIPS = [
	"Men",
	"Cis Man",
	"Trans Men",
	"Women",
	"Cis Woman",
	"Trans Women",
	"Non-Binary",
];
const COLLAPSED_CHIPS = [...PRIMARY_CHIPS, "Not specified"];
const EXPANDED_CHIPS = [
	...PRIMARY_CHIPS,
	"Agender",
	"Androgynous",
	"Bigender",
	"Not specified",
];

const genderFilter = (page: Page) =>
	page.locator('[role="dialog"] [data-slot="gender-filter"]');
const genderChips = (page: Page) =>
	genderFilter(page).locator('[data-slot="toggle-group-item"]');
const genderChip = (page: Page, name: string) =>
	genderFilter(page).getByRole("button", { name, exact: true });

async function openAllFilters(page: Page): Promise<void> {
	await page.locator('[aria-label="All filters"]').click();
	await genderChips(page).first().waitFor();
}

async function storedGenderFilter(page: Page) {
	const preferences = await storedPreferences(page);
	const filters = preferences?.gridSearchFilters as
		| { genders: number[]; genderEnabled: boolean }
		| undefined;
	return (
		filters && { genders: filters.genders, enabled: filters.genderEnabled }
	);
}

test.beforeEach(async ({ page }) => {
	test.setTimeout(180_000);
	await installTauriShim(page);
	await installPersistentAppData(page);
	await page.goto("/");
	await page.locator("nav a").first().waitFor({ timeout: 120_000 });
	await ensureGridLocation(page);
});

test("the gender filter offers Men, Women and their Cis and Trans genders first and never Ask Me", async ({
	page,
}) => {
	await openAllFilters(page);

	await expect(genderChips(page)).toHaveText(COLLAPSED_CHIPS);

	await genderFilter(page).getByRole("button", { name: "More" }).click();

	await expect(genderChips(page)).toHaveText(EXPANDED_CHIPS);
	await expect(genderFilter(page).getByText("Ask Me")).toHaveCount(0);
});

test("a saved Men selection shows its chip and can be swapped for Trans Women", async ({
	page,
}) => {
	await runPaletteCommand(page, "?genders=1");
	await openAllFilters(page);

	await expect(genderChip(page, "Men")).toHaveAttribute(
		"aria-pressed",
		"true",
	);
	await expect(genderChips(page)).toHaveText([
		"Men",
		"Women",
		"Cis Woman",
		"Trans Women",
		"Non-Binary",
		"Not specified",
	]);

	await genderChip(page, "Men").click();
	await genderChip(page, "Trans Women").click();

	await page.getByRole("button", { name: "Apply" }).click();

	await expect
		.poll(() => storedGenderFilter(page))
		.toEqual({ genders: [7], enabled: true });
});

test("Cis Man and the Men umbrella hide each other", async ({ page }) => {
	await runPaletteCommand(page, "?genders=4");
	await openAllFilters(page);

	const cisMan = genderChip(page, "Cis Man");
	const men = genderChip(page, "Men");
	await expect(cisMan).toHaveAttribute("aria-pressed", "true");
	await expect(men).toHaveCount(0);
	await expect(genderChip(page, "Trans Men")).toBeVisible();

	await cisMan.click();
	await men.click();

	await expect(cisMan).toHaveCount(0);
	await expect(genderChip(page, "Trans Men")).toHaveCount(0);
	await page.getByRole("button", { name: "Apply" }).click();

	await expect
		.poll(() => storedGenderFilter(page))
		.toEqual({ genders: [1], enabled: true });
});
