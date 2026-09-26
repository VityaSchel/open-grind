import { expect, type Page, test } from "@playwright/test";

import { installTauriShim } from "./support/app";

const APP_SETTINGS = "/settings/app";
const DESCRIPTION = "Use the haptic engine for interactions.";

test.describe.configure({ timeout: 120_000 });

async function openAppSettings(page: Page, platform: string) {
	await installTauriShim(page, { platform });
	await page.goto(APP_SETTINGS);
	await page
		.getByRole("heading", { name: "Display" })
		.waitFor({ timeout: 120_000 });
}

const hapticSwitch = (page: Page) =>
	page.getByRole("switch", { name: /^Haptic feedback/ });

for (const platform of ["android", "macos"]) {
	test(`${platform} describes haptics without naming gestures`, async ({
		page,
	}) => {
		await openAppSettings(page, platform);

		await expect(hapticSwitch(page)).toHaveAccessibleName(
			new RegExp(DESCRIPTION.replaceAll(".", "\\.")),
		);
	});
}

test("Linux offers no haptic feedback setting", async ({ page }) => {
	await openAppSettings(page, "linux");

	await expect(hapticSwitch(page)).toHaveCount(0);
});
