// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { goto } from "$app/navigation";
import { createRawSnippet } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("$app/state", () => ({
	page: { url: new URL("http://localhost/interest/taps") },
}));
vi.mock("$app/navigation", () => ({ goto: vi.fn() }));
vi.mock("./InterestPager.svelte", () => ({ default: () => {} }));

import { PSEUDO_MESSAGE } from "#lib/i18n/fixtures/pseudo-message.ts";
import { setLocale, SOURCE_LOCALE } from "#lib/i18n/index.ts";
import { resetPlatform, runningOn } from "#lib/test/platform.ts";
import InterestLayout from "./+layout.svelte";

beforeEach(() => runningOn("android"));

afterEach(async () => {
	cleanup();
	resetPlatform();
	vi.mocked(goto).mockClear();
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
		tabs: screen.getAllByRole("tab").map((tab) => tab.textContent.trim()),
	};
}

describe("Interest layout", () => {
	it("names the interest navigation and its tabs", () => {
		renderLayout();

		expect(tabNames()).toEqual({
			navigation: "Interest",
			tabs: ["Views", "Taps"],
		});
	});

	it("renames the navigation and its tabs when the locale changes", async () => {
		renderLayout();

		await setLocale({ locale: "en-XA" });

		const { navigation, tabs } = tabNames();
		expect(navigation).toMatch(PSEUDO_MESSAGE);
		expect(tabs).toHaveLength(2);
		for (const tab of tabs) expect(tab).toMatch(PSEUDO_MESSAGE);
	});

	it("selects the routed tab, keeps its link, and makes it the only Tab stop", () => {
		renderLayout();

		expect(
			screen
				.getAllByRole("tab")
				.map((tab) => ({
					href: tab.getAttribute("href"),
					selected: tab.getAttribute("aria-selected"),
					tabindex: tab.getAttribute("tabindex"),
					controls: Boolean(tab.getAttribute("aria-controls")),
				})),
		).toEqual([
			{
				href: "/interest/views",
				selected: "false",
				tabindex: "-1",
				controls: true,
			},
			{
				href: "/interest/taps",
				selected: "true",
				tabindex: "0",
				controls: true,
			},
		]);
	});

	it("switches with one replace on Enter and on a plain click, and leaves a modified click to the browser", async () => {
		renderLayout();
		const views = screen.getByRole("tab", { name: "Views" });

		const clicksPrevented: boolean[] = [];
		const record = (event: MouseEvent) => {
			clicksPrevented.push(event.defaultPrevented);
			event.preventDefault();
		};
		window.addEventListener("click", record);

		await fireEvent.keyDown(views, { key: "Enter" });
		await fireEvent.click(views);
		await fireEvent.click(views, { ctrlKey: true });
		window.removeEventListener("click", record);

		expect(vi.mocked(goto).mock.calls).toEqual([
			["/interest/views", { replace: true, reset: false }],
			["/interest/views", { replace: true, reset: false }],
		]);
		expect(clicksPrevented).toEqual([true, false]);
	});
});
