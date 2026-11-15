import type { SubpageRoute } from "#lib/components/shared/SubpageScreen.svelte";

export const SETTINGS = "/settings";

const base = "/(protected)/(navbar)/settings/(subpage)";

export const settingsSubpages: Readonly<Record<string, SubpageRoute>> = {
	[`${base}/account`]: {
		title: "settings.subpage.titles.account",
		back: "/settings",
	},
	[`${base}/account/privacy`]: {
		title: "settings.subpage.titles.privacy",
		back: "/settings/account",
	},
	[`${base}/account/blocked`]: {
		title: "settings.subpage.titles.blocked",
		back: "/settings/account",
	},
	[`${base}/account/hidden`]: {
		title: "settings.subpage.titles.hidden",
		back: "/settings/account",
	},
	[`${base}/albums`]: {
		title: "settings.subpage.titles.albums",
		back: "/settings",
		wide: true,
	},
	[`${base}/albums/new`]: {
		title: "settings.subpage.titles.newAlbum",
		back: "/settings/albums",
	},
	[`${base}/albums/[albumId]`]: {
		title: "settings.subpage.titles.editAlbum",
		back: "/settings/albums",
	},
	[`${base}/app`]: {
		title: "settings.subpage.titles.app",
		back: "/settings",
	},
	[`${base}/app/language`]: {
		title: "settings.subpage.titles.language",
		back: "/settings/app",
	},
	[`${base}/app/display`]: {
		title: "settings.app.sections.display",
		back: "/settings/app",
	},
	[`${base}/app/notifications`]: {
		title: "settings.subpage.titles.notifications",
		back: "/settings/app",
	},
	[`${base}/app/privacy`]: {
		title: "settings.app.sections.privacy",
		back: "/settings/app",
	},
	[`${base}/app/security`]: {
		title: "settings.app.sections.security",
		back: "/settings/app",
	},
	[`${base}/app/discreet-icon`]: {
		title: "settings.app.discreetAppIcon.title",
		back: "/settings/app/security",
		wide: true,
	},
	[`${base}/app/updates`]: {
		title: "settings.app.sections.updates",
		back: "/settings/app",
	},
	[`${base}/app/credits`]: {
		title: "settings.subpage.titles.credits",
		back: "/settings/app",
	},
	[`${base}/profile`]: {
		title: "settings.subpage.titles.profile",
		back: "/settings",
	},
};

export function settingsTrail(path: string): string[] {
	const route = settingsSubpages[`${base}${path.slice(SETTINGS.length)}`];
	return route === undefined ? [path] : [...settingsTrail(route.back), path];
}
