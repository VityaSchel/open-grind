import { expect, type Page, test } from "@playwright/test";

import { pathname } from "./support/app";
import {
	APP_SETTINGS,
	APP_SUBSCREENS,
	openAppSettings,
	openAppSubscreen,
	openSettings,
} from "./support/page-stack";

const TOAST = "[data-sonner-toast]";

test.describe.configure({ timeout: 180_000 });

const subpageTitle = (page: Page) =>
	page.getByRole("navigation", { name: "Page" }).locator("span");

const subscreen = (row: string) =>
	APP_SUBSCREENS.find((candidate) => candidate.row === row)!;

test.beforeEach(async ({ page }) => {
	await openSettings(page, { platform: "android" });
	await openAppSettings(page);
});

test("App Settings lists Language, the subscreens, the privacy policy and the credits, and no Updates row where updates aren’t offered", async ({
	page,
}) => {
	const rows = page.getByRole("main").getByRole("link");

	await expect
		.poll(async () =>
			(await rows.allTextContents()).map((text) =>
				text.replace(/\s+/g, " ").trim(),
			),
		)
		.toEqual([
			"Language English",
			"Display",
			"Notifications",
			"Privacy",
			"Security",
			"Privacy policy",
			"Credits & Licenses",
		]);
	await expect(page.locator(`a[href="${APP_SETTINGS}/updates"]`)).toHaveCount(
		0,
	);
	await expect(page.getByRole("main").getByRole("heading")).toHaveCount(0);
});

test("Display holds the units, blur and haptic feedback settings", async ({
	page,
}) => {
	await openAppSubscreen(page, subscreen("Display"));

	await expect(subpageTitle(page)).toHaveText("Display");
	await expect(page.getByRole("radio", { name: "Metric" })).toBeVisible();
	await expect(page.getByRole("radio", { name: "Imperial" })).toBeVisible();
	await expect(
		page.getByRole("slider", { name: "Background blur" }),
	).toBeVisible();
	await expect(
		page.getByRole("switch", { name: /^Haptic feedback/ }),
	).toBeVisible();
});

test("Privacy holds the online status, read receipt, profile view and GIPHY switches", async ({
	page,
}) => {
	await openAppSubscreen(page, subscreen("Privacy"));

	await expect(subpageTitle(page)).toHaveText("Privacy");
	const switches = page.getByRole("main").getByRole("switch");
	await expect(switches).toHaveCount(4);
	for (const [index, name] of [
		"Stay online while the app is open",
		"Reveal message read status",
		"Reveal profile views",
		"Enable GIPHY",
	].entries()) {
		await expect(switches.nth(index)).toHaveAccessibleName(
			new RegExp(`^${name}`),
		);
	}
});

test("Security says its rows aren’t built yet without leaving the page", async ({
	page,
}) => {
	await openAppSubscreen(page, subscreen("Security"));

	await expect(subpageTitle(page)).toHaveText("Security");
	for (const [name, issue] of [
		["Discreet App Icon", "#97"],
		["PIN", "#50"],
	] as const) {
		await page.getByRole("link", { name, exact: true }).click();

		await expect(
			page.locator(TOAST).getByRole("link", { name: issue }),
		).toBeVisible();
		expect(await pathname(page)).toBe(`${APP_SETTINGS}/security`);
		expect(await page.evaluate(() => location.hash)).toBe("");
	}
});

test("Notifications opens from its row", async ({ page }) => {
	await openAppSubscreen(page, subscreen("Notifications"));

	await expect(subpageTitle(page)).toHaveText("Notifications");
});
