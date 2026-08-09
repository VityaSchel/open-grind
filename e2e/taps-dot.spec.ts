import { expect, test } from "@playwright/test";

import { installTauriShim } from "./support/app";

const INTEREST_TAB = 'nav a[href="/interest"]';
const TAPS_DOT = `${INTEREST_TAB} [data-slot="badge"]`;

test("the interest tab dot clears once received taps are opened", async ({
	page,
}) => {
	await installTauriShim(page);
	await page.goto("/");
	await page.locator(INTEREST_TAB).waitFor({ timeout: 180_000 });

	await expect(page.locator(TAPS_DOT)).toBeVisible();

	await page.getByRole("link", { name: "Interest" }).click();
	await expect(page).toHaveURL(/\/interest\/taps$/);
	await expect(page.locator(TAPS_DOT)).toHaveCount(0);

	await page.getByRole("link", { name: "Browse" }).click();
	await expect(page).toHaveURL(/localhost:\d+\/$/);
	await expect(page.locator(TAPS_DOT)).toHaveCount(0);
});
