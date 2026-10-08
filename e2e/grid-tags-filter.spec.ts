import { expect, type Page, test } from "@playwright/test";

import { ensureGridLocation, installTauriShim } from "./support/app";
import {
	installPersistentAppData,
	storedPreferences,
} from "./support/app-data";
import { openAllFilters } from "./support/grid-filters";
import { introSizes } from "./support/transitions";

const DIALOG = '[role="dialog"]';

const apply = (page: Page) => page.getByRole("button", { name: "Apply" });
const tagsCheckbox = (page: Page) =>
	page.getByRole("checkbox", { name: "Tags" });
const coffeeChip = (page: Page) =>
	page.getByRole("button", { name: "Coffee", exact: true });

async function expectIntroToEndAtRestingHeight({
	page,
	startIntro,
}: {
	page: Page;
	startIntro: () => Promise<void>;
}): Promise<void> {
	const sizes = introSizes({ page, within: DIALOG });
	await startIntro();
	const { atEnd, settled } = await sizes;
	expect(atEnd).toHaveLength(1);
	expect(atEnd[0]?.height).toBeCloseTo(settled[0]?.height ?? NaN, 1);
}

test.beforeEach(async ({ page }) => {
	test.setTimeout(180_000);
	await installTauriShim(page);
	await installPersistentAppData(page);
	await page.goto("/");
	await page.locator("nav a").first().waitFor({ timeout: 120_000 });
	await ensureGridLocation(page);
});

test("the tags filter saves tag keys and shows tag texts", async ({ page }) => {
	await openAllFilters(page);
	await tagsCheckbox(page).click();
	await coffeeChip(page).click();

	await expect(
		page.locator(`${DIALOG} [data-slot="filter-field"]`, {
			has: tagsCheckbox(page),
		}),
	).toContainText("Coffee");

	await apply(page).click();

	await expect
		.poll(async () => {
			const preferences = await storedPreferences(page);
			const filters = preferences?.gridSearchFilters as
				| { tags: string[]; tagsEnabled: boolean }
				| undefined;
			return (
				filters && { tags: filters.tags, enabled: filters.tagsEnabled }
			);
		})
		.toEqual({ tags: ["coffee"], enabled: true });
});

test("expanding Tags grows to the full list without a jump at the end", async ({
	page,
}) => {
	await openAllFilters(page);
	await tagsCheckbox(page).click();
	await coffeeChip(page).waitFor();
	await tagsCheckbox(page).click();
	await coffeeChip(page).waitFor({ state: "detached" });

	await expectIntroToEndAtRestingHeight({
		page,
		startIntro: () => tagsCheckbox(page).click(),
	});
});

test("reopening with Tags checked grows to the full list without a jump at the end", async ({
	page,
}) => {
	await openAllFilters(page);
	await tagsCheckbox(page).click();
	await coffeeChip(page).click();
	await apply(page).click();
	await expect(page.locator(DIALOG)).toHaveCount(0);

	await expectIntroToEndAtRestingHeight({
		page,
		startIntro: () => openAllFilters(page),
	});
});
