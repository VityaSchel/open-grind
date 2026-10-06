// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

const { currentPage } = vi.hoisted(() => ({
	currentPage: { route: { id: "/settings/account" } },
}));

vi.mock("$app/state", () => ({ page: currentPage }));
vi.mock("$app/navigation", () => ({
	afterNavigate: vi.fn(),
	beforeNavigate: vi.fn(),
}));

import { setLocale, SOURCE_LOCALE } from "$lib/i18n";
import { PSEUDO_MESSAGE } from "$lib/i18n/fixtures/pseudo-message";
import SubpageScreen from "./SubpageScreen.svelte";

const routes = {
	"/settings/account": {
		title: "settings.subpage.titles.account",
		back: "/settings",
	},
} as const;

function renderAt(routeId: string) {
	currentPage.route.id = routeId;
	render(SubpageScreen, { props: { routes, parent: "/" } });
	return screen.getByRole("navigation", { name: "Page" });
}

afterEach(async () => {
	cleanup();
	await setLocale({ locale: SOURCE_LOCALE });
});

describe("SubpageScreen", () => {
	it("titles the page from its route", () => {
		const header = renderAt("/settings/account");

		expect(header.textContent.trim()).toBe("Account Settings");
		expect(
			screen.getByRole("link", { name: "Back" }).getAttribute("href"),
		).toBe("/settings");
	});

	it("leaves an unlisted route untitled and goes back to the parent", () => {
		const header = renderAt("/settings/elsewhere");

		expect(header.textContent.trim()).toBe("");
		expect(
			screen.getByRole("link", { name: "Back" }).getAttribute("href"),
		).toBe("/");
	});

	it("retitles the page when the locale changes", async () => {
		const header = renderAt("/settings/account");

		await setLocale({ locale: "en-XA" });

		await vi.waitFor(() =>
			expect(header.textContent.trim()).toMatch(PSEUDO_MESSAGE),
		);
	});
});
