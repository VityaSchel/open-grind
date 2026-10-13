import type { Page } from "@playwright/test";

import { overrideNative } from "../stubs";
import type { Scene } from ".";
import { STORAGE_FULL } from "./faults";
import { addingToast, toastsShown } from "./toast";
import { openAppSettings } from "./updates";

const BLUR_THUMB = '[data-slot="slider-thumb"]';
const UNREADABLE_PREFERENCES = [0xc1];
const DESKTOP_ENTRY = { available: true, installed: false };
const UNIMPLEMENTED_LINKS = [/Discreet App Icon/, /PIN/];

async function lowerBlur({
	page,
	description,
}: {
	page: Page;
	description: string;
}): Promise<void> {
	const thumb = page.locator(`${BLUR_THUMB}:not([data-disabled])`);
	await thumb.focus();
	await thumb.press("ArrowLeft");
	await page.getByText(description).waitFor();
	await thumb.blur();
}

export const blurQualities: Scene = {
	platform: "phone",
	views: [
		{
			id: "settings/app/blur-medium",
			drive: async (page) => {
				await openAppSettings(page);
				await lowerBlur({
					page,
					description: "A softer gradient blur.",
				});
			},
		},
		{
			id: "settings/app/blur-low",
			drive: (page) =>
				lowerBlur({ page, description: "A single light blur" }),
		},
		{
			id: "settings/app/blur-off",
			drive: (page) => lowerBlur({ page, description: "No blur." }),
		},
	],
};

export const blurUnsupported: Scene = {
	platform: "phone",
	native: { backdrop_filter_renders: { answer: false } },
	views: [
		{
			id: "settings/app/blur-unsupported",
			drive: async (page) => {
				await openAppSettings(page);
				await page.getByText("can’t blur backgrounds").waitFor();
			},
		},
	],
};

export const blurTrial: Scene = {
	platform: "phone",
	views: [
		{
			id: "settings/app/blur-trial",
			drive: async (page) => {
				await page.route("**/_app/env.js", (route) =>
					route.fulfill({
						contentType: "text/javascript",
						body: "export const env={}",
					}),
				);
				await openAppSettings(page);
				await page
					.getByText("chosen automatically as you scroll")
					.waitFor();
			},
		},
	],
};

function appsMenuSwitch(page: Page) {
	return page.getByRole("switch", { name: "Show in apps menu" });
}

export const appsMenuEntry: Scene = {
	platform: "desktop",
	shim: "linux",
	native: {
		desktop_entry_state: { answer: DESKTOP_ENTRY },
		desktop_entry_install: {
			reject: "The applications folder is read-only",
		},
	},
	views: [
		{
			id: "settings/app/apps-menu",
			survivesLocaleSwitch: false,
			drive: async (page) => {
				await openAppSettings(page);
				await addingToast({
					page,
					action: () => appsMenuSwitch(page).click(),
				});
				await overrideNative({
					page,
					overrides: {
						desktop_entry_install: { answer: null },
						desktop_entry_state: {
							answer: { ...DESKTOP_ENTRY, installed: true },
						},
						desktop_entry_remove: {
							reject: "The menu entry is in use",
						},
					},
				});
				await appsMenuSwitch(page).click();
				await page
					.getByRole("switch", {
						name: "Show in apps menu",
						checked: true,
					})
					.waitFor();
				await appsMenuSwitch(page).click();
				await toastsShown({ page, count: 2 });
			},
		},
	],
};

export const appUnimplemented: Scene = {
	platform: "phone",
	views: [
		{
			id: "settings/app/unimplemented",
			survivesLocaleSwitch: false,
			drive: async (page) => {
				await openAppSettings(page);
				for (const name of UNIMPLEMENTED_LINKS) {
					await addingToast({
						page,
						action: () => page.getByRole("link", { name }).click(),
					});
				}
				await toastsShown({ page, count: 2 });
			},
		},
	],
};

export const settingSaveFailed: Scene = {
	platform: "phone",
	native: { write_app_data: { reject: STORAGE_FULL } },
	views: [
		{
			id: "settings/app/save-failed",
			survivesLocaleSwitch: false,
			drive: async (page) => {
				await openAppSettings(page);
				await addingToast({
					page,
					action: () =>
						page
							.getByRole("switch", { name: "Stay online" })
							.click(),
				});
			},
		},
	],
};

export const preferencesLoadFailed: Scene = {
	platform: "phone",
	native: { read_app_data: { answer: UNREADABLE_PREFERENCES } },
	views: [
		{
			id: "settings/app/load-failed",
			survivesLocaleSwitch: false,
			drive: async (page) => {
				await openAppSettings(page);
				await toastsShown({ page, count: 1 });
			},
		},
	],
};
