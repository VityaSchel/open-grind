import { expect, test } from "@playwright/test";

import {
	DEMO_GEOHASH,
	ensureGridLocation,
	installTauriShim,
} from "./support/app";

const OPTION = '[role="option"]';

test("the @ command copies the current location and still sets a new one", async ({
	page,
}) => {
	test.setTimeout(240_000);
	await installTauriShim(page);
	await page.goto("/");
	await page.locator("nav a").first().waitFor({ timeout: 120_000 });
	await ensureGridLocation(page);

	await page.keyboard.press("Meta+k");
	const palette = page.getByRole("combobox");
	await palette.waitFor();

	await palette.fill("@");
	await expect(page.locator(OPTION)).toHaveText([
		`Copy currently selected location: ${DEMO_GEOHASH}`,
	]);
	await expect(page.locator(OPTION)).toHaveAttribute("data-selected", "");

	// a typed geohash must replace the copy item, not pile up next to it
	await palette.fill(`@${DEMO_GEOHASH}`);
	await expect(page.locator(OPTION)).toHaveText([`@${DEMO_GEOHASH}`]);
	await expect(page.locator(OPTION)).toHaveAttribute("data-selected", "");

	await palette.fill("@");
	await expect(page.locator(OPTION)).toHaveCount(1);

	await page.keyboard.press("Enter");
	await expect(palette).toHaveCount(0);
	await expect(
		page.getByText("Location copied to clipboard").first(),
	).toBeVisible();

	// copying is not a mutation: the location is still the one we copied
	await page.keyboard.press("Meta+k");
	await palette.waitFor();
	await palette.fill("@");
	await expect(page.locator(OPTION)).toHaveText([
		`Copy currently selected location: ${DEMO_GEOHASH}`,
	]);
});
