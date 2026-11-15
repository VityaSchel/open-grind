import type { Page } from "@playwright/test";

import type { NativeOverrides } from "../stubs";
import type { Scene } from ".";
import { press } from "./press";
import { addingToast } from "./toast";
import { visit } from "./visit";

const CHOSEN = { id: "hook-app", name: "Hook App" };
const PRESETS = [
	CHOSEN,
	{ id: "papizza", name: "papizza" },
	{ id: "taps24", name: "Taps24" },
];
const PREVIEW = `data:image/svg+xml,${encodeURIComponent(
	'<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" rx="14" fill="#8a8f98"/></svg>',
)}`;

function disguiseNative({
	renameNeedsAdmin = false,
}: { renameNeedsAdmin?: boolean } = {}): NativeOverrides {
	return {
		disguise_state: {
			answer: {
				available: true,
				current: "original",
				presets: PRESETS,
				renameNeedsAdmin,
			},
		},
		disguise_previews: {
			answer: Object.fromEntries(
				["original", ...PRESETS.map(({ id }) => id)].map((id) => [
					id,
					PREVIEW,
				]),
			),
		},
		disguise_select: { reject: "The launcher refused the change" },
	};
}

function openDiscreetIcon(page: Page): Promise<void> {
	return visit({
		page,
		path: "/settings/app/security/discreet-icon",
		ready: page.locator('[data-slot="disguise-choices"] button img[src]'),
	});
}

function choosePreset(page: Page): Promise<void> {
	return press(
		page.locator('[data-slot="disguise-choices"] button', {
			hasText: CHOSEN.name,
		}),
	);
}

export const discreetIcon: Scene = {
	platform: "phone",
	native: disguiseNative(),
	views: [
		{ id: "settings/discreet-icon", drive: openDiscreetIcon },
		{
			id: "settings/discreet-icon/confirm",
			screen: "settings/discreet-icon",
			survivesLocaleSwitch: false,
			drive: async (page) => {
				await choosePreset(page);
				await page.getByRole("alertdialog").waitFor();
			},
		},
		{
			id: "settings/discreet-icon/failed",
			screen: "settings/discreet-icon",
			survivesLocaleSwitch: false,
			drive: (page) =>
				addingToast({
					page,
					action: () =>
						press(
							page
								.getByRole("alertdialog")
								.getByRole("button")
								.last(),
						),
				}),
		},
	],
};

export const macosDiscreetIcon: Scene = {
	platform: "desktop",
	native: disguiseNative(),
	views: [
		{ id: "settings/discreet-icon/macos", drive: openDiscreetIcon },
		{
			id: "settings/discreet-icon/macos/confirm",
			screen: "settings/discreet-icon/macos",
			survivesLocaleSwitch: false,
			drive: async (page) => {
				await choosePreset(page);
				await page.getByRole("alertdialog").waitFor();
			},
		},
	],
};

export const macosDiscreetIconAdmin: Scene = {
	platform: "desktop",
	native: disguiseNative({ renameNeedsAdmin: true }),
	views: [
		{ id: "settings/discreet-icon/macos/admin", drive: openDiscreetIcon },
	],
};

export const windowsDiscreetIcon: Scene = {
	platform: "desktop",
	shim: "windows",
	native: disguiseNative(),
	views: [{ id: "settings/discreet-icon/windows", drive: openDiscreetIcon }],
};

export const linuxDiscreetIcon: Scene = {
	platform: "desktop",
	shim: "linux",
	native: disguiseNative(),
	views: [{ id: "settings/discreet-icon/linux", drive: openDiscreetIcon }],
};
