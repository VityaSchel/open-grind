import type { Page } from "@playwright/test";

import { overrideNative } from "../stubs";
import type { Scene } from ".";
import { STORAGE_FULL, UNREADABLE_PREFERENCES } from "./faults";
import {
	openAppSettings,
	openDisplaySettings,
	openPrivacySettings,
	openSecuritySettings,
} from "./settings";
import { addingToast, toastsShown } from "./toast";

const BLUR_THUMB = '[data-slot="slider-thumb"]';
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
			id: "settings/display/blur-medium",
			drive: async (page) => {
				await openDisplaySettings(page);
				await lowerBlur({
					page,
					description: "A softer gradient blur.",
				});
			},
		},
		{
			id: "settings/display/blur-low",
			drive: (page) =>
				lowerBlur({ page, description: "A single light blur" }),
		},
		{
			id: "settings/display/blur-off",
			drive: (page) => lowerBlur({ page, description: "No blur." }),
		},
	],
};

export const blurUnsupported: Scene = {
	platform: "phone",
	native: { backdrop_filter_renders: { answer: false } },
	views: [
		{
			id: "settings/display/blur-unsupported",
			drive: async (page) => {
				await openDisplaySettings(page);
				await page.getByText("can’t blur backgrounds").waitFor();
			},
		},
	],
};

export const blurTrial: Scene = {
	platform: "phone",
	views: [
		{
			id: "settings/display/blur-trial",
			drive: async (page) => {
				await page.route("**/_app/env.js", (route) =>
					route.fulfill({
						contentType: "text/javascript",
						body: "export const env={}",
					}),
				);
				await openDisplaySettings(page);
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
			id: "settings/display/apps-menu",
			screen: "settings/display/macos",
			survivesLocaleSwitch: false,
			drive: async (page) => {
				await openDisplaySettings(page);
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
			id: "settings/security/unimplemented",
			screen: "settings/security",
			survivesLocaleSwitch: false,
			drive: async (page) => {
				await openSecuritySettings(page);
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
			id: "settings/privacy/save-failed",
			screen: "settings/privacy",
			survivesLocaleSwitch: false,
			drive: async (page) => {
				await openPrivacySettings(page);
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
			screen: "settings/app",
			survivesLocaleSwitch: false,
			drive: async (page) => {
				await openAppSettings(page);
				await toastsShown({ page, count: 1 });
			},
		},
	],
};
