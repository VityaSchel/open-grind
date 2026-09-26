import { expect, type Page } from "@playwright/test";

import { adb, liveDevice } from "./device";
import { navigateInApp } from "./navigation";

const berlinCentre = { longitude: "13.4050", latitude: "52.5200" };

const locationPermissions = [
	"android.permission.ACCESS_FINE_LOCATION",
	"android.permission.ACCESS_COARSE_LOCATION",
];

function giveTheDeviceALocation() {
	adb(["emu", "geo", "fix", berlinCentre.longitude, berlinCentre.latitude]);
	for (const permission of locationPermissions) {
		adb(["shell", "pm", "grant", liveDevice.appPackage, permission]);
	}
}

export async function ensureDeviceLocation(page: Page) {
	giveTheDeviceALocation();
	await navigateInApp({ page, path: "/" });
	const profileTile = page.locator('a[href^="/profile/"]').first();
	const useCurrentLocation = page.getByRole("button", {
		name: "Use current location",
	});
	await expect(profileTile.or(useCurrentLocation)).toBeVisible({
		timeout: 60_000,
	});
	if (await useCurrentLocation.isVisible()) {
		await useCurrentLocation.click();
	}
	await expect(profileTile).toBeVisible({ timeout: 60_000 });
}
