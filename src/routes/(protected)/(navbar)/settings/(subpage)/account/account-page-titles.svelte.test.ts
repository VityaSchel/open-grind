// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

const pending = vi.hoisted(() => () => new Promise<never>(() => {}));

vi.mock("$lib/api/browse/blocks", () => ({
	blockUser: pending,
	getBlockedUsers: pending,
	unblockUser: pending,
}));
vi.mock("$lib/api/browse/hides", () => ({
	getHiddenUserIdsNewestFirst: pending,
	hideUser: pending,
	unhideUser: pending,
}));
vi.mock("$app/navigation", () => ({ beforeNavigate: vi.fn() }));

import { setLocale, SOURCE_LOCALE } from "$lib/i18n";
import { PSEUDO_MESSAGE } from "$lib/i18n/fixtures/pseudo-message";
import AccountPage from "./+page.svelte";
import BlockedPage from "./blocked/+page.svelte";
import HiddenPage from "./hidden/+page.svelte";

const pages = [
	{
		route: "/settings/account/blocked",
		title: "Blocked Users",
		open: () => render(BlockedPage),
	},
	{
		route: "/settings/account/hidden",
		title: "Hidden Users",
		open: () => render(HiddenPage),
	},
];

afterEach(async () => {
	cleanup();
	await setLocale({ locale: SOURCE_LOCALE });
});

describe("account pages", () => {
	it.each(pages)(
		"titles $route in the active locale",
		async ({ title, open }) => {
			open();

			expect(document.title).toBe(title);

			await setLocale({ locale: "en-XA" });

			expect(document.title).toMatch(PSEUDO_MESSAGE);
		},
	);

	it.each([
		{ route: "/settings/account/privacy", title: "Privacy" },
		...pages,
	])(
		"links $route from account settings by its title",
		({ route, title }) => {
			render(AccountPage);

			expect(
				screen.getByRole("link", { name: title }).getAttribute("href"),
			).toBe(route);
		},
	);
});
