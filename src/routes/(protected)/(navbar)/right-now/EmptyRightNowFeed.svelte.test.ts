// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FilterPosition } from "#lib/model/browse/grid/filters.ts";
import {
	defaultRightNowFeedFilters,
	type RightNowFeedFilters,
} from "#lib/model/right-now/filters.ts";
import EmptyRightNowFeed from "./EmptyRightNowFeed.svelte";
import type { RightNowFeedFiltersState } from "./right-now-feed-filters-state.svelte";

function renderEmpty(
	overrides: Partial<RightNowFeedFilters> = {},
	{
		ownPostRunning = false,
		joinable = true,
	}: { ownPostRunning?: boolean; joinable?: boolean } = {},
) {
	const filters = {
		current: { ...defaultRightNowFeedFilters, ...overrides },
		resetFilters: vi.fn(),
	};
	const filtersState = filters as unknown as RightNowFeedFiltersState;
	render(EmptyRightNowFeed, {
		props: { filters: filtersState, ownPostRunning, joinable },
	});
	return filters;
}

afterEach(cleanup);

describe("the empty Right Now feed", () => {
	it("invites joining, without a reset, while no filter narrows the feed", () => {
		renderEmpty({ sort: "DISTANCE", ageEnabled: true });

		expect(screen.getByText("No Posts Yet")).toBeTruthy();
		expect(screen.getByText(/Join to be the first/)).toBeTruthy();
		expect(
			screen.queryByRole("button", { name: "Reset filters" }),
		).toBeNull();
	});

	it("says no one else is on while our own post runs off the feed", () => {
		renderEmpty({}, { ownPostRunning: true, joinable: false });

		expect(
			screen.getByText("No one else nearby is on Right Now."),
		).toBeTruthy();
		expect(screen.queryByText(/Join to be the first/)).toBeNull();
	});

	it("does not invite joining when no free posts are left", () => {
		renderEmpty({}, { joinable: false });

		expect(screen.getByText("No one nearby is on Right Now.")).toBeTruthy();
		expect(screen.queryByText(/Join to be the first/)).toBeNull();
	});

	it.each<[string, Partial<RightNowFeedFilters>]>([
		["hosting", { hostingEnabled: true }],
		["age", { ageEnabled: true, age: [30, 40] }],
		[
			"position",
			{ positionEnabled: true, positions: [FilterPosition.NotSpecified] },
		],
	])("blames the %s filter and offers to reset it", async (_, overrides) => {
		const filters = renderEmpty(overrides);

		expect(screen.getByText("No Results")).toBeTruthy();
		expect(screen.getByText("No posts match these filters.")).toBeTruthy();
		await fireEvent.click(
			screen.getByRole("button", { name: "Reset filters" }),
		);
		expect(filters.resetFilters).toHaveBeenCalledOnce();
	});
});
