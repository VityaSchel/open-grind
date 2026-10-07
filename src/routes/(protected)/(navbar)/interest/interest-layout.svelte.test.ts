// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/svelte";
import { createRawSnippet } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("$app/state", () => ({
	page: { url: new URL("http://localhost/interest/taps") },
}));
vi.mock("$app/navigation", () => ({ goto: vi.fn() }));
vi.mock("./InterestPager.svelte", () => ({ default: () => {} }));

import { setLocale, SOURCE_LOCALE } from "$lib/i18n";
import { PSEUDO_MESSAGE } from "$lib/i18n/fixtures/pseudo-message";
import InterestLayout from "./+layout.svelte";

afterEach(async () => {
	cleanup();
	await setLocale({ locale: SOURCE_LOCALE });
});

function renderLayout() {
	render(InterestLayout, {
		props: {
			data: { ourProfileId: 1 },
			params: {},
			children: createRawSnippet(() => ({
				render: () => "<span></span>",
			})),
		},
	});
}

function tabNames() {
	return {
		navigation: screen.getByRole("navigation").getAttribute("aria-label"),
		links: screen
			.getAllByRole("link")
			.map((link) => link.textContent.trim()),
	};
}

describe("Interest layout", () => {
	it("names the interest navigation and its tabs", () => {
		renderLayout();

		expect(tabNames()).toEqual({
			navigation: "Interest",
			links: ["Views", "Taps"],
		});
	});

	it("renames the navigation and its tabs when the locale changes", async () => {
		renderLayout();

		await setLocale({ locale: "en-XA" });

		const { navigation, links } = tabNames();
		expect(navigation).toMatch(PSEUDO_MESSAGE);
		expect(links).toHaveLength(2);
		for (const link of links) expect(link).toMatch(PSEUDO_MESSAGE);
	});
});
