import { expect, test } from "@playwright/test";

import { setAppDataWriteDelay } from "./support/app-data";
import { permissionPromptCount, setGeolocation } from "./support/geolocation";
import {
	enableTracking,
	gpsSwitch,
	gridReady,
	launchGrid,
	openChooser,
	relaunch,
	toast,
	trackingDot,
} from "./support/gps";

test.beforeEach(async ({ page }) => {
	test.setTimeout(300_000);
	await launchGrid(page);
});

test("launch asks for the permission exactly once, even mid-disable", async ({
	page,
}) => {
	await enableTracking(page);

	// permission revoked between launches; answering the native dialog hides and
	// re-shows the webview, and the disable write is still in flight when the
	// visibility resume triggers a reconcile — the second sample must not re-ask
	await setGeolocation(page, {
		permission: "prompt",
		promptResult: "denied",
		promptVisibilityCycle: true,
	});
	await setAppDataWriteDelay(page, 50);
	await relaunch(page);

	await expect(toast(page)).toContainText("Location permission denied");
	await expect(gridReady(page)).toBeVisible({ timeout: 60_000 });
	await expect(trackingDot(page)).toHaveCount(0);
	expect(await permissionPromptCount(page)).toBe(1);
});

test("a toast over the open chooser is tappable and does not close it", async ({
	page,
}) => {
	await setGeolocation(page, {
		permission: "prompt",
		promptResult: "denied",
	});
	await openChooser(page);
	await gpsSwitch(page).click();

	await expect(toast(page)).toContainText("Location permission denied");
	await toast(page).getByRole("button", { name: "Settings" }).click();

	await expect(toast(page)).toHaveCount(0);
	await expect(gpsSwitch(page)).toBeVisible();
});
