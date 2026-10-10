import { expect, type Page } from "@playwright/test";

import {
	ensureGridLocation,
	GRID_READY_SELECTOR,
	installTauriShim,
} from "./app";
import { installPersistentAppData } from "./app-data";
import { installGeolocationShim } from "./geolocation";

export const trackingDot = (page: Page) =>
	page.locator('[data-slot="tracking-dot"]');
export const gpsSwitch = (page: Page) =>
	page.locator("#track-gps-automatically");
export const locationButton = (page: Page) =>
	page.locator('[aria-label="Change location"]');
export const saveButton = (page: Page) =>
	page.getByRole("button", { name: "Save" });
export const gridReady = (page: Page) => page.locator(GRID_READY_SELECTOR);
export const profileTile = (page: Page) => page.locator('a[href^="/profile/"]');
export const toast = (page: Page) => page.locator("[data-sonner-toast]");
export const PAST_INTERACTIVE_REUSE_MS = 11_000;

export async function installGpsHarness(page: Page): Promise<void> {
	await installTauriShim(page, { platform: "android" });
	await installPersistentAppData(page);
	await installGeolocationShim(page);
}

export async function openChooser(page: Page): Promise<void> {
	await locationButton(page).click();
	await gpsSwitch(page).waitFor({ timeout: 30_000 });
}

export async function enableTracking(page: Page): Promise<void> {
	await openChooser(page);
	await gpsSwitch(page).click();
	await expect(gpsSwitch(page)).toHaveAttribute("data-state", "checked");
	await saveButton(page).click();
	await expect(trackingDot(page)).toHaveCount(1);
}

export async function launchGrid(page: Page): Promise<void> {
	await installGpsHarness(page);
	await page.goto("/");
	await page.locator("nav a").first().waitFor({ timeout: 120_000 });
	await ensureGridLocation(page);
}

export async function relaunch(page: Page): Promise<void> {
	await page.reload();
	await page.locator("nav a").first().waitFor({ timeout: 120_000 });
}

export async function startFrameSampler(
	page: Page,
	{ selector, cssProperty }: { selector: string; cssProperty: string },
): Promise<void> {
	await page.evaluate(
		([sel, prop]) => {
			const samples: (string | null)[] = [];
			(
				window as unknown as { __frameSamples: (string | null)[] }
			).__frameSamples = samples;
			const record = () => {
				const el = document.querySelector(sel);
				samples.push(
					el ? getComputedStyle(el).getPropertyValue(prop) : null,
				);
				requestAnimationFrame(record);
			};
			requestAnimationFrame(record);
		},
		[selector, cssProperty] as const,
	);
}

export async function frameSamples(page: Page): Promise<(string | null)[]> {
	return await page.evaluate(
		() =>
			(window as unknown as { __frameSamples: (string | null)[] })
				.__frameSamples,
	);
}
