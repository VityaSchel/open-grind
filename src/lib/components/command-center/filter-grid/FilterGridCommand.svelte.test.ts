// @vitest-environment jsdom

import { fireEvent, within } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { gotoMock, showErrorToastMock } = vi.hoisted(() => ({
	gotoMock: vi.fn(),
	showErrorToastMock: vi.fn(),
}));

vi.mock("$app/navigation", () => ({ goto: gotoMock }));
vi.mock("$lib/api/error-toast", () => ({ showErrorToast: showErrorToastMock }));
vi.mock("$lib/grid/grid-state.svelte", () => ({
	gridState: { filters: { set: vi.fn() } },
}));

import { setLocale, SOURCE_LOCALE, t } from "$lib/i18n";
import { PSEUDO_MESSAGE } from "$lib/i18n/fixtures/pseudo-message";
import {
	expectCommandGroup,
	openWith,
	option,
	resetCommandCenter,
	textOf,
} from "../command-center-test-helpers";

function filterOption(query: string): HTMLElement {
	const item = option(query);
	if (!item) throw new Error(`no option for ${query}`);
	return item;
}

function badges(): { name: string; value: string }[] {
	return [
		...document.querySelectorAll<HTMLElement>('[data-slot="badge"]'),
	].map((badge) => {
		const name = badge.firstElementChild;
		const value = [...badge.childNodes].filter((node) => node !== name);
		return {
			name: name ? textOf(name) : "",
			value: value.map(textOf).join(""),
		};
	});
}

beforeEach(() => {
	gotoMock.mockReset().mockResolvedValue(undefined);
	showErrorToastMock.mockReset();
});

afterEach(async () => {
	resetCommandCenter();
	await setLocale({ locale: SOURCE_LOCALE });
});

describe("filter grid command", () => {
	it("hints at the query syntax under its heading", async () => {
		await openWith("?");

		expectCommandGroup({ name: "Filter Grid…", value: "filter-grid" });
		const hint = filterOption("?");
		expect(textOf(hint)).toBe(
			"Type a Grid query, e.g. online=true&age=18-99&tribes=2,12",
		);
		expect(
			within(hint)
				.getByText("online=true&age=18-99&tribes=2,12")
				.getAttribute("translate"),
		).toBe("no");
	});

	it("names each filter with its value and counts one filter", async () => {
		await openWith("?online=true");

		expect(badges()).toEqual([{ name: "Online", value: "Yes" }]);
		expect(
			within(filterOption("?online=true")).getByText(
				"Press Enter to apply 1 filter",
			),
		).toBeDefined();
	});

	it("counts several filters", async () => {
		await openWith("?online=true&age=18-30");

		expect(
			within(filterOption("?online=true&age=18-30")).getByText(
				"Press Enter to apply 2 filters",
			),
		).toBeDefined();
	});

	it("asks to fix an invalid filter before applying", async () => {
		await openWith("?online=maybe");

		const item = filterOption("?online=maybe");
		expect(badges()).toEqual([
			{ name: "Online", value: "Expected true or false" },
		]);
		expect(
			within(item).getByText("Fix the highlighted filters to apply"),
		).toBeDefined();
		expect(item).toHaveProperty("ariaDisabled", "true");
	});

	it("shows an unknown filter key as typed, untranslated", async () => {
		await openWith("?nope=1");
		await setLocale({ locale: "en-XA" });

		const [badge] = badges();
		expect(badge?.name).toBe("nope");
		expect(badge?.value).toMatch(PSEUDO_MESSAGE);
		expect(
			within(filterOption("?nope=1"))
				.getByText("nope")
				.getAttribute("translate"),
		).toBe("no");
	});

	it("shows typed gender IDs and tags as typed, untranslated", async () => {
		const query = "?genders=-1,1&tags=bear,otter";
		await openWith(query);

		expect(badges()).toEqual([
			{ name: "Gender", value: "Not Specified, 1" },
			{ name: "Tags", value: "bear, otter" },
		]);
		expect(
			[...filterOption(query).querySelectorAll('[translate="no"]')].map(
				textOf,
			),
		).toEqual(["1", "bear", "otter"]);
	});

	it("words the heading, names and hints in the active locale", async () => {
		await openWith("?online=true");
		await setLocale({ locale: "en-XA" });

		expectCommandGroup({ name: PSEUDO_MESSAGE, value: "filter-grid" });
		const [badge] = badges();
		expect(badge?.name).toMatch(PSEUDO_MESSAGE);
		expect(badge?.value).toMatch(PSEUDO_MESSAGE);
		const hint = t("commands.filterGrid.applyHint", { count: 1 });
		expect(hint).toMatch(PSEUDO_MESSAGE);
		expect(
			within(filterOption("?online=true")).getByText(hint),
		).toBeDefined();
	});

	it("reports filters it couldn't apply", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		const error = new Error("navigation failed");
		gotoMock.mockRejectedValue(error);
		await openWith("?online=true");

		await fireEvent.click(filterOption("?online=true"));

		await vi.waitFor(() =>
			expect(showErrorToastMock).toHaveBeenCalledExactlyOnceWith({
				label: "Couldn’t apply filters",
				error,
			}),
		);
	});
});
