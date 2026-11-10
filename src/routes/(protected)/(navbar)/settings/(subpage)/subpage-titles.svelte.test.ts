// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/svelte";
import { createRawSnippet } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

const { currentPage } = vi.hoisted(() => ({
	currentPage: { route: { id: "" } },
}));

vi.mock("$app/state", () => ({ page: currentPage }));
vi.mock("$app/navigation", () => ({
	afterNavigate: vi.fn(),
	beforeNavigate: vi.fn(),
}));

import { PSEUDO_MESSAGE } from "#lib/i18n/fixtures/pseudo-message.ts";
import { setLocale, SOURCE_LOCALE } from "#lib/i18n/index.ts";
import SubpageLayout from "./+layout.svelte";

const GROUP = "/(protected)/(navbar)/settings/(subpage)";

const TITLES: Record<string, string> = {
	"/account": "Account Settings",
	"/account/privacy": "Privacy",
	"/account/blocked": "Blocked Users",
	"/account/hidden": "Hidden Users",
	"/albums": "My Albums",
	"/albums/new": "New Album",
	"/albums/[albumId]": "Edit Album",
	"/app": "App Settings",
	"/app/language": "Language",
	"/app/display": "Display",
	"/app/notifications": "Notifications",
	"/app/privacy": "Privacy",
	"/app/security": "Security",
	"/app/updates": "Updates",
	"/app/credits": "Credits & Licenses",
	"/profile": "Edit Profile",
};

const pageRoutes = Object.keys(import.meta.glob("./**/+page.svelte")).map(
	(file) => file.slice(1, -"/+page.svelte".length),
);

function openSubpage(route: string) {
	currentPage.route.id = `${GROUP}${route}`;
	render(SubpageLayout, {
		props: {
			data: { ourProfileId: 1 },
			params: {},
			children: createRawSnippet(() => ({ render: () => "<div></div>" })),
		},
	});
}

afterEach(async () => {
	cleanup();
	document.title = "";
	await setLocale({ locale: SOURCE_LOCALE });
});

describe("settings subpages", () => {
	it("cover every page in the group", () => {
		expect(pageRoutes.toSorted()).toEqual(Object.keys(TITLES).toSorted());
	});

	it.each(Object.entries(TITLES))(
		"title %s as %s, replacing the previous title, in the active locale",
		async (route, title) => {
			document.title = "Previous Page";

			openSubpage(route);

			expect(document.title).toBe(title);

			await setLocale({ locale: "en-XA" });

			await vi.waitFor(() =>
				expect(document.title).toMatch(PSEUDO_MESSAGE),
			);
		},
	);
});
