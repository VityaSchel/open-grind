// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { flushSync } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { setPreferencesMock } = vi.hoisted(() => ({
	setPreferencesMock: vi.fn(() => Promise.resolve()),
}));

vi.mock("#lib/app-data/preferences.svelte.ts", () => ({
	getPreferences: vi.fn(() => Promise.resolve({})),
	setPreferences: setPreferencesMock,
}));

vi.stubGlobal(
	"ResizeObserver",
	class {
		observe() {}
		unobserve() {}
		disconnect() {}
	},
);

import { GridSearchFiltersState } from "#lib/grid/grid-search-filters-state.svelte.ts";
import {
	defaultFilters,
	FilterPosition,
} from "#lib/model/browse/grid/filters.ts";
import PositionQuickFilter from "./PositionQuickFilter.svelte";

async function openPositionFilter() {
	const onQueryChange = vi.fn();
	const filters = new GridSearchFiltersState({ onQueryChange });
	await filters.ready;
	const view = render(PositionQuickFilter, {
		props: { open: true, filters },
	});
	flushSync();
	return { filters, onQueryChange, rerender: view.rerender };
}

function switchChecked() {
	return screen
		.getByRole("switch", { name: "Filter by position" })
		.getAttribute("aria-checked");
}

function pressed(name: string) {
	return screen.getByRole("button", { name }).getAttribute("aria-pressed");
}

beforeEach(() => {
	setPreferencesMock.mockClear();
});

afterEach(() => {
	cleanup();
});

describe("PositionQuickFilter", () => {
	it("turns the filter on when a position is picked, then applies and saves it", async () => {
		const { filters, onQueryChange } = await openPositionFilter();

		expect(switchChecked()).toBe("false");

		await fireEvent.click(screen.getByRole("button", { name: "Vers Top" }));

		expect(switchChecked()).toBe("true");

		await fireEvent.click(screen.getByRole("button", { name: "Apply" }));

		const applied = {
			...defaultFilters,
			positionEnabled: true,
			positions: [FilterPosition.VersTop],
		};
		expect(filters.value).toEqual(applied);
		expect(setPreferencesMock).toHaveBeenCalledExactlyOnceWith({
			gridSearchFilters: applied,
		});
		expect(onQueryChange).toHaveBeenCalledOnce();
	});

	it("clears the picked positions on Reset without turning the filter off", async () => {
		const { filters } = await openPositionFilter();
		await fireEvent.click(screen.getByRole("button", { name: "Top" }));

		await fireEvent.click(screen.getByRole("button", { name: "Reset" }));

		expect(pressed("Top")).toBe("false");
		expect(switchChecked()).toBe("true");

		await fireEvent.click(screen.getByRole("button", { name: "Apply" }));

		expect(filters.value).toEqual({
			...defaultFilters,
			positionEnabled: true,
			positions: [],
		});
	});

	it("changes nothing when closed without Apply, and starts over from the saved positions", async () => {
		const { filters, onQueryChange, rerender } = await openPositionFilter();

		await fireEvent.click(screen.getByRole("button", { name: "Bottom" }));
		expect(pressed("Bottom")).toBe("true");

		await rerender({ open: false });

		expect(filters.value).toEqual(defaultFilters);
		expect(setPreferencesMock).not.toHaveBeenCalled();
		expect(onQueryChange).not.toHaveBeenCalled();

		await rerender({ open: true });

		expect(pressed("Bottom")).toBe("false");
		expect(switchChecked()).toBe("false");
	});
});
