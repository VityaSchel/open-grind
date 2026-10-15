import type { Scene, SceneView } from ".";
import { visit } from "./visit";

const SUBPAGE_SCROLLER = '[data-slot="subpage-scroller"]';

function subpage({ id, path }: { id: string; path: string }): SceneView {
	return {
		id,
		scroller: SUBPAGE_SCROLLER,
		drive: (page) =>
			visit({
				page,
				path,
				ready: page.getByRole("main").getByRole("heading"),
			}),
	};
}

export const appSettings: Scene = {
	platform: "phone",
	views: [subpage({ id: "settings/app", path: "/settings/app" })],
};

export const desktopAppSettings: Scene = {
	platform: "desktop",
	views: [
		{
			id: "settings/app/macos",
			drive: (page) =>
				visit({
					page,
					path: "/settings/app",
					ready: page.getByRole("main").getByRole("heading"),
				}),
		},
	],
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
	views: [subpage({ id: "settings/profile", path: "/settings/profile" })],
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
