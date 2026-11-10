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
vi.mock("./(navbar)/profile/[profileId]/BackButton.svelte", () => ({
	default: () => {},
}));
vi.mock("./(navbar)/profile/[profileId]/pager/ProfilePager.svelte", () => ({
	default: () => {},
}));

import { PSEUDO_MESSAGE } from "#lib/i18n/fixtures/pseudo-message.ts";
import { setLocale, SOURCE_LOCALE } from "#lib/i18n/index.ts";
import TapsPage from "./(navbar)/interest/taps/+page.svelte";
import ViewsPage from "./(navbar)/interest/views/+page.svelte";
import ProfilePage from "./(navbar)/profile/[profileId]/+page.svelte";
import RightNowPage from "./(navbar)/right-now/+page.svelte";
import MePage from "./(navbar)/settings/(me)/+page.svelte";
import ConversationPage from "./chat/[conversationId]/+page.svelte";
import InboxPage from "./chat/+page.svelte";

const DATA = { ourProfileId: 1 };

const pages = [
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
	{ route: "/interest/taps", title: "Taps", open: () => render(TapsPage) },
	{ route: "/interest/views", title: "Views", open: () => render(ViewsPage) },
	{ route: "/chat", title: "Inbox", open: () => render(InboxPage) },
	{
		route: "/chat/[conversationId]",
		title: "Conversation",
		open: () => render(ConversationPage),
	},
	{
		route: "/profile/[profileId]",
		title: "Profile",
		open: () =>
			render(ProfilePage, {
				props: { data: DATA, params: { profileId: "100001" } },
			}),
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

			expect(document.title).toBe(title);

			await setLocale({ locale: "en-XA" });

			await vi.waitFor(() =>
				expect(document.title).toMatch(PSEUDO_MESSAGE),
			);
		},
	);
});
