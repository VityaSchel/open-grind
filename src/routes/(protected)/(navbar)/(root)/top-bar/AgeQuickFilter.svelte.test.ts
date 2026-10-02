// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { flushSync } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("$lib/app-data/preferences.svelte", () => ({
	getPreferences: vi.fn(() => Promise.resolve({})),
	setPreferences: vi.fn(() => Promise.resolve()),
}));

vi.mock("$lib/grid/grid-state.svelte", async () => {
	const { GridSearchFiltersState } =
		await import("$lib/grid/grid-search-filters-state.svelte");
	return {
		gridState: {
			filters: new GridSearchFiltersState({ onQueryChange: vi.fn() }),
		},
	};
});

vi.stubGlobal(
	"ResizeObserver",
	class {
		observe() {}
		unobserve() {}
		disconnect() {}
	},
);

import { gridState } from "$lib/grid/grid-state.svelte";
import { defaultFilters } from "$lib/model/browse/grid/filters";
import AgeQuickFilter from "./AgeQuickFilter.svelte";

afterEach(() => {
	cleanup();
	gridState.filters.reset();
});

describe("AgeQuickFilter", () => {
	it("keeps an in-progress edit when the stored filters change underneath", async () => {
		await gridState.filters.ready;
		render(AgeQuickFilter, { props: { open: true } });
		flushSync();

		expect(document.body.textContent).toContain("18 years & over");

		gridState.filters.set({ age: [30, 40] });
		flushSync();

		expect(document.body.textContent).toContain("18 years & over");
		expect(document.body.textContent).not.toContain("30 - 40");
	});

	it("keeps reset available at the default age range, where it changes nothing", async () => {
		await gridState.filters.ready;
		render(AgeQuickFilter, { props: { open: true } });
		flushSync();

		const reset = screen.getByRole("button", { name: "Reset" });
		const filterSwitch = screen.getByRole("switch", {
			name: "Filter by age",
		});

		expect(reset).toHaveProperty("disabled", false);

		await fireEvent.click(reset);

		expect(document.body.textContent).toContain("18 years & over");
		expect(filterSwitch.getAttribute("aria-checked")).toBe("false");

		await fireEvent.click(screen.getByRole("button", { name: "Apply" }));

		expect(gridState.filters.snapshot()).toEqual(defaultFilters);
	});
});
