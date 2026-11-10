// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("$app/env", () => ({ version: "test" }));
vi.mock("./(navbar)/settings/(me)/AccountSettingsLink.svelte", () => ({
	default: () => {},
}));
vi.mock("./(navbar)/settings/(me)/AlbumsLink.svelte", () => ({
	default: () => {},
}));
vi.mock("./(navbar)/settings/(me)/AppSettingsLink.svelte", () => ({
	default: () => {},
}));
vi.mock("./(navbar)/settings/(me)/ProfileLink.svelte", () => ({
	default: () => {},
}));
vi.mock("./(navbar)/settings/(me)/SignOutButton.svelte", () => ({
	default: () => {},
}));
vi.mock("./(navbar)/settings/(me)/Socials.svelte", () => ({
	default: () => {},
}));
vi.mock("#lib/app-data/preferences.svelte.ts", () => ({
	hydratePreferences: () => new Promise(() => {}),
	preferencesSnapshot: () => ({ geohash: null }),
}));
vi.mock("#lib/grid/grid-state.svelte.ts", () => ({
	gridState: { onStartOver: () => () => {} },
}));
vi.mock("#lib/util/scroll-restore.svelte.ts", () => ({
	restoreScrollOnce: () => {},
}));

import { PSEUDO_TITLE } from "#lib/i18n/fixtures/pseudo-message.ts";
import { setLocale, SOURCE_LOCALE } from "#lib/i18n/index.ts";
import BrowsePage from "./(navbar)/(root)/+page.svelte";
import RightNowPage from "./(navbar)/right-now/+page.svelte";
import MePage from "./(navbar)/settings/(me)/+page.svelte";

const DATA = { ourProfileId: 1 };

const pages = [
	{ route: "/", title: "Browse", open: () => render(BrowsePage) },
	{
		route: "/settings",
		title: "Me",
		open: () => render(MePage, { props: { data: DATA, params: {} } }),
	},
	{
		route: "/right-now",
		title: "Right Now",
		open: () => render(RightNowPage),
	},
];

afterEach(async () => {
	cleanup();
	document.title = "";
	await setLocale({ locale: SOURCE_LOCALE });
});

describe("page titles", () => {
	it.each(pages)(
		"$route replaces the previous page's title with $title in the active locale",
		async ({ title, open }) => {
			document.title = "Edit Album";

			open();

			expect(document.title).toBe(`${title} — Open Grind`);

			await setLocale({ locale: "en-XA" });

			await vi.waitFor(() =>
				expect(document.title).toMatch(PSEUDO_TITLE),
			);
		},
	);
});
