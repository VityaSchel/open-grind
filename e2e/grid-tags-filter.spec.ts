import { expect, test } from "@playwright/test";

import { ensureGridLocation, installTauriShim } from "./support/app";
import {
	installPersistentAppData,
	storedPreferences,
} from "./support/app-data";

test("the tags filter saves tag keys and shows tag texts", async ({ page }) => {
	test.setTimeout(180_000);
	await installTauriShim(page);
	await installPersistentAppData(page);
	await page.goto("/");
	await page.locator("nav a").first().waitFor({ timeout: 120_000 });
	await ensureGridLocation(page);

	await page.locator('[aria-label="All filters"]').click();
	const apply = page.getByRole("button", { name: "Apply" });
	await apply.waitFor();
	await page.getByRole("checkbox", { name: "Tags" }).click();
	await page.getByRole("button", { name: "Coffee", exact: true }).click();

	await expect(
		page.locator('[role="dialog"] [data-slot="filter-field"]', {
			has: page.getByRole("checkbox", { name: "Tags" }),
		}),
	).toContainText("Coffee");

	await apply.click();

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
