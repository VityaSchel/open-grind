import { expect, type Page, test } from "@playwright/test";

import { encodeGeohash } from "../src/lib/model/geohash";
import { storedPreferences } from "./support/app-data";
import {
	positionRequestCount,
	setGeolocation,
	setPageVisibility,
} from "./support/geolocation";
import {
	enableTracking,
	gpsSwitch,
	gridReady,
	installGpsHarness,
	launchGrid,
	locationButton,
	openChooser,
	PAST_INTERACTIVE_REUSE_MS,
	profileTile,
	relaunch,
	saveButton,
	toast,
	trackingDot,
} from "./support/gps";

test.beforeEach(() => {
	test.setTimeout(300_000);
});

async function storedGeohash(page: Page): Promise<string | null> {
	const preferences = await storedPreferences(page);
	return (preferences?.geohash as string | undefined) ?? null;
}

test("detecting the location turns on automatic updates and explains it", async ({
	page,
}) => {
	await installGpsHarness(page);
	await page.goto("/");
	const useCurrent = page.getByRole("button", {
		name: "Use current location",
	});
	await useCurrent.waitFor({ timeout: 120_000 });
	await useCurrent.click();

	await expect(toast(page)).toContainText(
		"Your location will be updating automatically using GPS",
	);
	await expect(gridReady(page)).toBeVisible({ timeout: 60_000 });
	await expect(trackingDot(page)).toHaveCount(1);
});

test("the toggle only takes effect once Save is pressed", async ({ page }) => {
	await launchGrid(page);
	await expect(trackingDot(page)).toHaveCount(0);

	await openChooser(page);
	await gpsSwitch(page).click();
	await expect(gpsSwitch(page)).toHaveAttribute("data-state", "checked");
	await page.keyboard.press("Escape");
	await expect(trackingDot(page)).toHaveCount(0);

	await openChooser(page);
	await expect(gpsSwitch(page)).toHaveAttribute("data-state", "unchecked");
	await gpsSwitch(page).click();
	await saveButton(page).click();
	await expect(trackingDot(page)).toHaveCount(1);
});

test("the marker sits inside the location button, 4x4", async ({ page }) => {
	await launchGrid(page);
	await enableTracking(page);

	const dotBox = (await trackingDot(page).boundingBox())!;
	const buttonBox = (await locationButton(page).boundingBox())!;
	expect(Math.round(dotBox.width)).toBe(4);
	expect(Math.round(dotBox.height)).toBe(4);
	expect(dotBox.x).toBeGreaterThan(buttonBox.x);
	expect(dotBox.y).toBeGreaterThan(buttonBox.y);
	expect(dotBox.x + dotBox.width).toBeLessThan(buttonBox.x + buttonBox.width);
});

test("turning tracking back off clears the marker", async ({ page }) => {
	await launchGrid(page);
	await enableTracking(page);

	await openChooser(page);
	await gpsSwitch(page).click();
	await expect(gpsSwitch(page)).toHaveAttribute("data-state", "unchecked");
	await saveButton(page).click();
	await expect(trackingDot(page)).toHaveCount(0);
});

test("a refused permission explains itself and leaves the toggle off", async ({
	page,
}) => {
	await launchGrid(page);
	await setGeolocation(page, {
		permission: "prompt",
		promptResult: "denied",
	});

	await openChooser(page);
	await gpsSwitch(page).click();

	await expect(toast(page)).toContainText("Location permission denied");
	await expect(gpsSwitch(page)).toHaveAttribute("data-state", "unchecked");
	await page.keyboard.press("Escape");
	await expect(trackingDot(page)).toHaveCount(0);
});

test("a relaunch shows skeletons and holds the cells for the fresh fix", async ({
	page,
}) => {
	await launchGrid(page);
	await enableTracking(page);

	await setGeolocation(page, { delayMs: 6000 });
	await relaunch(page);

	await expect(gridReady(page)).toBeVisible({ timeout: 60_000 });
	await expect.poll(() => positionRequestCount(page)).toBeGreaterThan(0);
	expect(await profileTile(page).count()).toBe(0);

	await expect(profileTile(page).first()).toBeVisible({ timeout: 60_000 });
	await expect(trackingDot(page)).toHaveCount(1);
});

test("a hung fix still lets the grid through", async ({ page }) => {
	await launchGrid(page);
	await enableTracking(page);

	await setGeolocation(page, { hang: true });
	await relaunch(page);

	await expect(profileTile(page).first()).toBeVisible({ timeout: 60_000 });
});

test("a permission revoked between launches turns tracking off for good", async ({
	page,
}) => {
	await launchGrid(page);
	await enableTracking(page);

	await setGeolocation(page, { permission: "denied" });
	await relaunch(page);

	await expect(toast(page)).toContainText("Location permission denied");
	await expect(gridReady(page)).toBeVisible({ timeout: 60_000 });
	await expect(trackingDot(page)).toHaveCount(0);

	await openChooser(page);
	await expect(gpsSwitch(page)).toHaveAttribute("data-state", "unchecked");
});

test("a reconcile-driven refresh re-requests GPS and follows the move", async ({
	page,
}) => {
	await launchGrid(page);
	await enableTracking(page);

	await setGeolocation(page, { fail: true });
	await relaunch(page);
	await expect(profileTile(page).first()).toBeVisible({ timeout: 60_000 });
	const before = await storedGeohash(page);

	const moved = { lat: 52.5245, lon: 13.405 };
	await setGeolocation(page, {
		fail: false,
		coords: { latitude: moved.lat, longitude: moved.lon },
	});
	await setPageVisibility(page, "hidden");
	await setPageVisibility(page, "visible");

	await expect
		.poll(async () => await storedGeohash(page), { timeout: 20_000 })
		.toBe(encodeGeohash(moved));
	expect(before).not.toBe(encodeGeohash(moved));
	await expect(gridReady(page)).toBeVisible();
	expect(await profileTile(page).count()).toBeGreaterThan(0);
});

test("returning to the foreground after moving re-samples a recent fix", async ({
	page,
}) => {
	await launchGrid(page);
	await enableTracking(page);

	await page.waitForTimeout(PAST_INTERACTIVE_REUSE_MS);
	const moved = { lat: 52.5245, lon: 13.405 };
	await setGeolocation(page, {
		coords: { latitude: moved.lat, longitude: moved.lon },
	});
	await setPageVisibility(page, "hidden");
	await setPageVisibility(page, "visible");

	await expect
		.poll(async () => await storedGeohash(page), { timeout: 20_000 })
		.toBe(encodeGeohash(moved));
	expect(await profileTile(page).count()).toBeGreaterThan(0);
});
