import type { Page } from "@playwright/test";

import type { Scene } from ".";
import { openAppSettings } from "./updates";
import { visit } from "./visit";

const SUBPAGE_SCROLLER = '[data-slot="subpage-scroller"]';

export function openDisplaySettings(page: Page): Promise<void> {
	return visit({
		page,
		path: "/settings/app/display",
		ready: page.getByRole("slider", { name: "Background blur" }),
	});
}

export function openPrivacySettings(page: Page): Promise<void> {
	return visit({
		page,
		path: "/settings/app/privacy",
		ready: page.getByRole("switch", { name: "Enable GIPHY" }),
	});
}

export function openSecuritySettings(page: Page): Promise<void> {
	return visit({
		page,
		path: "/settings/app/security",
		ready: page.getByRole("link", { name: /PIN/ }),
	});
}

export const appSettings: Scene = {
	platform: "phone",
	views: [
		{
			id: "settings/app",
			scroller: SUBPAGE_SCROLLER,
			drive: openAppSettings,
		},
	],
};

export const desktopAppSettings: Scene = {
	platform: "desktop",
	views: [{ id: "settings/app/macos", drive: openAppSettings }],
};

export const languageSettings: Scene = {
	platform: "phone",
	views: [
		{
			id: "settings/language",
			scroller: SUBPAGE_SCROLLER,
			drive: (page) =>
				visit({
					page,
					path: "/settings/app/language",
					ready: page.getByRole("radio", { checked: true }),
				}),
		},
	],
};

export const meSettings: Scene = {
	platform: "phone",
	views: [
		{
			id: "settings/me",
			drive: (page) =>
				visit({
					page,
					path: "/settings",
					ready: page.getByRole("link", { name: "App Settings" }),
				}),
		},
	],
};

export const profileSettings: Scene = {
	platform: "phone",
	views: [
		{
			id: "settings/profile",
			scroller: SUBPAGE_SCROLLER,
			drive: (page) =>
				visit({
					page,
					path: "/settings/profile",
					ready: page.getByRole("main").getByRole("heading"),
				}),
		},
	],
};

export const accountSettings: Scene = {
	platform: "phone",
	views: [
		{
			id: "settings/account",
			drive: (page) =>
				visit({
					page,
					path: "/settings/account",
					ready: page.getByRole("link", { name: "Privacy" }),
				}),
		},
	],
};
