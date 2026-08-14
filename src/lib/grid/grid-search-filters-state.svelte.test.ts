import { beforeEach, describe, expect, it, vi } from "vitest";

const { getPreferencesMock, setPreferencesMock } = vi.hoisted(() => ({
	getPreferencesMock: vi.fn(),
	setPreferencesMock: vi.fn(() => Promise.resolve()),
}));

vi.mock("$lib/app-data/preferences.svelte", () => ({
	getPreferences: getPreferencesMock,
	setPreferences: setPreferencesMock,
}));

import { GridSearchFiltersState } from "$lib/grid/grid-search-filters-state.svelte";
import { defaultFilters } from "$lib/model/browse/grid/filters";

async function loadedState(onQueryChange = vi.fn()) {
	const state = new GridSearchFiltersState({ onQueryChange });
	await state.ready;
	return { state, onQueryChange };
}

beforeEach(() => {
	getPreferencesMock.mockReset();
	setPreferencesMock.mockClear();
	getPreferencesMock.mockResolvedValue({
		gridSearchFilters: { ...defaultFilters, genders: [1, 2] },
	});
});

describe("snapshot", () => {
	it("falls back to the defaults before the stored filters load", () => {
		const state = new GridSearchFiltersState({ onQueryChange: vi.fn() });

		expect(state.snapshot()).toEqual(defaultFilters);
	});

	it("detaches the copy from the stored filters", async () => {
		const { state } = await loadedState();

		const snapshot = state.snapshot();
		state.set({ genders: [3] });

		expect(snapshot.genders).toEqual([1, 2]);
	});
});

describe("set", () => {
	it("ignores a patch that changes nothing", async () => {
		const { state, onQueryChange } = await loadedState();

		state.set({ genders: [1, 2] });

		expect(onQueryChange).not.toHaveBeenCalled();
		expect(setPreferencesMock).not.toHaveBeenCalled();
	});

	it("applies a patch that changes a nested list", async () => {
		const { state, onQueryChange } = await loadedState();

		state.set({ genders: [2, 1] });

		expect(state.value?.genders).toEqual([2, 1]);
		expect(onQueryChange).toHaveBeenCalledOnce();
		expect(setPreferencesMock).toHaveBeenCalledOnce();
	});

	it("applies a patch that changes a scalar", async () => {
		const { state, onQueryChange } = await loadedState();

		state.set({ isFavorite: !defaultFilters.isFavorite });

		expect(onQueryChange).toHaveBeenCalledOnce();
	});
});
