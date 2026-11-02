// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { flushSync } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getPreferencesMock, setPreferencesMock } = vi.hoisted(() => ({
	getPreferencesMock: vi.fn(),
	setPreferencesMock: vi.fn(() => Promise.resolve()),
}));

vi.mock("#lib/app-data/preferences.svelte.ts", () => ({
	getPreferences: getPreferencesMock,
	setPreferences: setPreferencesMock,
}));

vi.mock("#lib/api/error-toast.ts", () => ({ showErrorToast: vi.fn() }));

vi.mock("#lib/components/filters/QuickFilterButton.svelte", { spy: true });

vi.stubGlobal(
	"ResizeObserver",
	class {
		observe() {}
		unobserve() {}
		disconnect() {}
	},
);

import QuickFilterButton from "#lib/components/filters/QuickFilterButton.svelte";
import { FilterPosition } from "#lib/model/browse/grid/filters.ts";
import {
	defaultRightNowFeedFilters,
	type RightNowFeedFilters,
} from "#lib/model/right-now/filters.ts";
import { RightNowFeedFiltersState } from "../right-now-feed-filters-state.svelte";
import QuickFilters from "./QuickFilters.svelte";

async function renderQuickFilters(stored: Partial<RightNowFeedFilters> = {}) {
	getPreferencesMock.mockResolvedValue({
		rightNowFeedFilters: { ...defaultRightNowFeedFilters, ...stored },
	});
	const filters = new RightNowFeedFiltersState({ onQueryChange: vi.fn() });
	await filters.ready;
	render(QuickFilters, { props: { filters } });
	flushSync();
	return filters;
}

function buttonNames() {
	return screen
		.getAllByRole("button")
		.map((button) => button.textContent.trim());
}

function activeFilters() {
	const names = buttonNames();
	const { calls } = vi.mocked(QuickFilterButton).mock;
	expect(calls).toHaveLength(names.length);
	return names.filter((_, index) => calls[index]?.[1].active);
}

beforeEach(() => {
	getPreferencesMock.mockReset();
	setPreferencesMock.mockClear();
	vi.mocked(QuickFilterButton).mockClear();
});

afterEach(() => {
	cleanup();
});

describe("QuickFilters", () => {
	it("offers the sort order, Age, Position and Hosting", async () => {
		await renderQuickFilters();

		expect(buttonNames()).toEqual(["Newest", "Age", "Position", "Hosting"]);
		expect(
			screen.getByRole("button", { name: "Sort: Newest" }),
		).toBeTruthy();
	});

	it("flips the sort between Newest and Distance on each tap and saves it", async () => {
		const filters = await renderQuickFilters();

		await fireEvent.click(
			screen.getByRole("button", { name: "Sort: Newest" }),
		);

		expect(filters.value?.sort).toBe("DISTANCE");
		expect(setPreferencesMock).toHaveBeenLastCalledWith({
			rightNowFeedFilters: {
				...defaultRightNowFeedFilters,
				sort: "DISTANCE",
			},
		});
		expect(screen.queryByRole("dialog")).toBeNull();

		await fireEvent.click(
			screen.getByRole("button", { name: "Sort: Distance" }),
		);

		expect(filters.value?.sort).toBe("NEWEST");
		expect(
			screen.getByRole("button", { name: "Sort: Newest" }),
		).toBeTruthy();
	});

	it.each<[string, Partial<RightNowFeedFilters>, string[]]>([
		["only the sort order at the defaults", {}, ["Newest"]],
		["the sort order by distance", { sort: "DISTANCE" }, ["Distance"]],
		[
			"Age when the age filter is on",
			{ ageEnabled: true },
			["Newest", "Age"],
		],
		[
			"Position when the position filter is on",
			{ positionEnabled: true, positions: [FilterPosition.Top] },
			["Newest", "Position"],
		],
		[
			"Hosting when the hosting filter is on",
			{ hostingEnabled: true, hosting: false },
			["Newest", "Hosting"],
		],
		[
			"no filter whose values are set but switched off",
			{ age: [30, 40], positions: [FilterPosition.Top], hosting: false },
			["Newest"],
		],
	])("highlights %s", async (_, stored, active) => {
		await renderQuickFilters(stored);

		expect(activeFilters()).toEqual(active);
	});

	it("highlights a filter as soon as it is applied", async () => {
		const filters = await renderQuickFilters();

		filters.set({ hostingEnabled: true });
		flushSync();

		expect(activeFilters()).toEqual(["Newest", "Hosting"]);
	});

	it.each([
		["Age", "Age"],
		["Position", "Positions"],
		["Hosting", "Hosting"],
	])("opens only the %s drawer from its button", async (button, title) => {
		await renderQuickFilters();

		expect(screen.queryByRole("dialog")).toBeNull();

		await fireEvent.click(screen.getByRole("button", { name: button }));

		expect(await screen.findByRole("dialog", { name: title })).toBeTruthy();
		expect(screen.getAllByRole("dialog")).toHaveLength(1);
	});
});
