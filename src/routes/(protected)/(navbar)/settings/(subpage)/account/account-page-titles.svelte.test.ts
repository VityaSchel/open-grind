// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import AccountPage from "./+page.svelte";

afterEach(() => {
	cleanup();
});

describe("account pages", () => {
	it.each([
		{ route: "/settings/account/privacy", title: "Privacy" },
		{ route: "/settings/account/blocked", title: "Blocked Users" },
		{ route: "/settings/account/hidden", title: "Hidden Users" },
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
