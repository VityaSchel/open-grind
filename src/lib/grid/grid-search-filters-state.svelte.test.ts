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

async function loadedState(onRefresh = vi.fn()) {
	const state = new GridSearchFiltersState({ onRefresh });
	await state.ready;
	return { state, onRefresh };
}

beforeEach(() => {
	getPreferencesMock.mockReset();
	setPreferencesMock.mockClear();
	getPreferencesMock.mockResolvedValue({
		gridSearchFilters: { ...defaultFilters, genders: [1, 2] },
	});
});

describe("set", () => {
	it("ignores a patch that changes nothing", async () => {
		const { state, onRefresh } = await loadedState();

		state.set({ genders: [1, 2] });

		expect(onRefresh).not.toHaveBeenCalled();
		expect(setPreferencesMock).not.toHaveBeenCalled();
	});

	it("applies a patch that changes a nested list", async () => {
		const { state, onRefresh } = await loadedState();

		state.set({ genders: [2, 1] });

		expect(state.value?.genders).toEqual([2, 1]);
		expect(onRefresh).toHaveBeenCalledOnce();
		expect(setPreferencesMock).toHaveBeenCalledOnce();
	});

	it("applies a patch that changes a scalar", async () => {
		const { state, onRefresh } = await loadedState();

		state.set({ isFavorite: !defaultFilters.isFavorite });

		expect(onRefresh).toHaveBeenCalledOnce();
	});
});
