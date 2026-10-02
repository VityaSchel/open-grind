import { expect, type Page, test } from "@playwright/test";

import {
	afterTwoFrames,
	FIRST_ROUTE_COMPILE_MS,
	installTauriShim,
	meTab,
} from "./support/app";
import {
	installPersistentAppData,
	storedPreferences,
} from "./support/app-data";

const saveChanges = (page: Page) =>
	page.getByRole("button", { name: "Save changes" });
const height = (page: Page) => page.getByRole("button", { name: /^Height / });
const weight = (page: Page) => page.getByRole("textbox", { name: "Weight" });

test.describe.configure({ timeout: 240_000 });

test.beforeEach(async ({ page }) => {
	await installTauriShim(page);
	await installPersistentAppData(page);
	await page.goto("/settings/app");
	const imperial = page.getByRole("radio", { name: "Imperial" });
	await imperial.waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });
	await imperial.click();
	await expect
		.poll(async () => (await storedPreferences(page))?.units)
		.toBe("imperial");

	await page.goto("/settings/profile");
	await weight(page).waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });
});

test("the profile editor shows height and weight in imperial units without changing them", async ({
	page,
}) => {
	await expect(height(page)).toHaveAccessibleName("Height 5'10\"");
	await expect(weight(page)).toHaveValue("165");
	await expect(page.getByText("lb", { exact: true })).toBeVisible();
	expect(await page.getByText(/^(cm|kg)$/).count()).toBe(0);

	await weight(page).focus();
	await page.keyboard.press("Tab");
	await expect(weight(page)).not.toBeFocused();
	await height(page).click();
	const shownHeight = page.getByRole("menuitemradio", {
		name: "5'10\"",
		exact: true,
	});
	await expect(shownHeight).toBeInViewport({ ratio: 1 });
	await shownHeight.click();
	await expect(height(page)).toHaveAttribute("aria-expanded", "false");
	await afterTwoFrames(page);

	await expect(weight(page)).toHaveValue("165");
	expect(await saveChanges(page).count()).toBe(0);
});

test("the height menu opened from the keyboard starts on the height it shows", async ({
	page,
}) => {
	await height(page).focus();
	await page.keyboard.press("Enter");

	const shownHeight = page.getByRole("menuitemradio", {
		name: "5'10\"",
		exact: true,
	});
	await expect(shownHeight).toBeFocused();
	await expect(shownHeight).toBeInViewport({ ratio: 1 });

	await page.keyboard.press("ArrowDown");
	await expect(
		page.getByRole("menuitemradio", { name: "5'11\"", exact: true }),
	).toBeFocused();
});

test("a height picked in feet and a weight typed in pounds reach the profile", async ({
	page,
}) => {
	await height(page).click();
	await page
		.getByRole("menuitemradio", { name: "6'0\"", exact: true })
		.click();
	await weight(page).fill("180");
	await saveChanges(page).click();
	await expect(page.getByText("Profile updated")).toBeVisible();

	await meTab(page).click();
	await page.getByRole("link", { name: /View your profile/ }).click();

	const stats = page.getByText("180 lb").first();
	await expect(stats).toBeVisible();
	await expect(stats).toContainText("6'0\"");
});
