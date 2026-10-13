import type { Page } from "@playwright/test";

import {
	setGeolocation,
	setPageVisibility,
} from "../../../e2e/support/geolocation";
import { overrideNative } from "../stubs";
import type { Scene } from ".";
import { LOCATION_TITLE } from "./browse";
import { GRID_READY, showGrid } from "./browse-states";
import { STORAGE_FULL } from "./faults";
import { addingToast, holdToast } from "./toast";
import { visit } from "./visit";

const INTERACTIVE_FIX_EXPIRED_MS = 11_000;
const SELECTED_LOCATION = '[title*="Selected location"]';
const CHANGE_LOCATION = '[aria-label*="Change location"]';

function useCurrentLocation(page: Page) {
	return page.getByRole("button", { name: "Use current location" });
}

async function locateFailing(page: Page): Promise<void> {
	await addingToast({ page, action: () => useCurrentLocation(page).click() });
	await useCurrentLocation(page).and(page.locator(":enabled")).waitFor();
}

async function advanceClock({
	page,
	ms,
}: {
	page: Page;
	ms: number;
}): Promise<void> {
	await page.evaluate((shift) => {
		const now = Date.now.bind(Date);
		Date.now = () => now() + shift;
	}, ms);
}

export const locationFailures: Scene = {
	platform: "phone",
	views: [
		{
			id: "browse/location/failures",
			survivesLocaleSwitch: false,
			drive: async (page) => {
				await visit({
					page,
					path: "/",
					ready: page.locator(LOCATION_TITLE),
				});
				await setGeolocation(page, { permission: "denied" });
				await locateFailing(page);
				await setGeolocation(page, {
					permission: "granted",
					fail: true,
				});
				await locateFailing(page);
				await setGeolocation(page, { fail: false });
				await overrideNative({
					page,
					overrides: { write_app_data: { reject: STORAGE_FULL } },
				});
				await locateFailing(page);
			},
		},
	],
};

export const autoLocationFailure: Scene = {
	platform: "phone",
	views: [
		{
			id: "browse/location/auto-update-failed",
			survivesLocaleSwitch: false,
			drive: async (page) => {
				await visit({
					page,
					path: "/",
					ready: page.locator(LOCATION_TITLE),
				});
				await setGeolocation(page, { fail: false });
				await useCurrentLocation(page).click();
				await page.locator(GRID_READY).waitFor();
				await setGeolocation(page, { fail: true });
				await advanceClock({ page, ms: INTERACTIVE_FIX_EXPIRED_MS });
				await setPageVisibility(page, "hidden");
				await setPageVisibility(page, "visible");
				await page
					.getByText("Couldn’t update your location automatically")
					.waitFor();
				await holdToast(page);
			},
		},
	],
};

export const locationChange: Scene = {
	platform: "phone",
	views: [
		{
			id: "browse/location/change",
			drive: async (page) => {
				await showGrid(page);
				await page.locator(CHANGE_LOCATION).click();
				await page.locator(SELECTED_LOCATION).waitFor();
			},
		},
	],
};
