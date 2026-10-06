// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("$app/state", () => ({
	page: {
		route: { id: "/(protected)/(navbar)/(root)" },
		url: new URL("http://localhost/"),
	},
}));
vi.mock("$app/navigation", () => ({ goto: vi.fn() }));
vi.mock("$lib/api/users/profiles", () => ({
	getProfile: () => Promise.resolve({ medias: [] }),
}));
vi.mock("$lib/chat/conversations-context.svelte", () => ({
	getOrCreateConversationsState: () => ({ hasUnread: false }),
}));
vi.mock("$lib/interest/taps-state.svelte", () => ({
	getTapsState: () => ({ hasUnseen: false }),
}));

import { setLocale, SOURCE_LOCALE } from "$lib/i18n";
import { PSEUDO_MESSAGE } from "$lib/i18n/fixtures/pseudo-message";
import NavBar from "./NavBar.svelte";

afterEach(async () => {
	cleanup();
	await setLocale({ locale: SOURCE_LOCALE });
});

function tabNames() {
	const navigation = screen.getByRole("navigation");
	return {
		navigation: navigation.getAttribute("aria-label"),
		links: screen
			.getAllByRole("link")
			.map(
				(link) =>
					link.getAttribute("aria-label") ?? link.textContent.trim(),
			),
	};
}

describe("NavBar", () => {
	it("names the main navigation and its tabs", () => {
		render(NavBar, { props: { ourProfileId: 1 } });

		expect(tabNames()).toEqual({
			navigation: "Main",
			links: ["Browse", "Right Now", "Interest", "Inbox", "Me"],
		});
	});

	it("renames the navigation and its tabs when the locale changes", async () => {
		render(NavBar, { props: { ourProfileId: 1 } });

		await setLocale({ locale: "en-XA" });

		const { navigation, links } = tabNames();
		expect(navigation).toMatch(PSEUDO_MESSAGE);
		expect(links).toHaveLength(5);
		for (const link of links) expect(link).toMatch(PSEUDO_MESSAGE);
	});
});
