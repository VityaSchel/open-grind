// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

const pending = vi.hoisted(() => () => new Promise<never>(() => {}));

vi.mock("$lib/api/messaging/albums", () => ({
	getAlbumContent: pending,
	getAlbumStorageLimits: pending,
	getMyAlbums: pending,
}));
vi.mock("$app/state", () => ({ page: { params: { albumId: "900" } } }));

import { clearAccountCaches } from "$lib/api/account-caches";
import { setLocale, SOURCE_LOCALE } from "$lib/i18n";
import { PSEUDO_MESSAGE } from "$lib/i18n/fixtures/pseudo-message";
import EditAlbumPage from "./[albumId]/+page.svelte";
import MyAlbumsPage from "./+page.svelte";
import NewAlbumPage from "./new/+page.svelte";

const PAGE_PROPS = { data: { ourProfileId: 1 }, params: { albumId: "900" } };

const pages = [
	{
		route: "/settings/albums",
		title: "My Albums",
		open: () => render(MyAlbumsPage, { props: PAGE_PROPS }),
	},
	{
		route: "/settings/albums/new",
		title: "New Album",
		open: () => render(NewAlbumPage, { props: PAGE_PROPS }),
	},
	{
		route: "/settings/albums/[albumId]",
		title: "Edit Album",
		open: () => render(EditAlbumPage, { props: PAGE_PROPS }),
	},
];

afterEach(async () => {
	cleanup();
	clearAccountCaches();
	await setLocale({ locale: SOURCE_LOCALE });
});

describe("album pages", () => {
	it.each(pages)(
		"titles $route in the active locale",
		async ({ title, open }) => {
			open();

			expect(document.title).toBe(title);

			await setLocale({ locale: "en-XA" });

			expect(document.title).toMatch(PSEUDO_MESSAGE);
		},
	);
});
