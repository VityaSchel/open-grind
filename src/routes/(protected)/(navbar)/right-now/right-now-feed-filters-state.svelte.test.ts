import { afterEach, beforeEach, expect, it, vi } from "vitest";

const { getPreferencesMock, setPreferencesMock, showErrorToastMock } =
	vi.hoisted(() => ({
		getPreferencesMock: vi.fn(),
		setPreferencesMock: vi.fn(() => Promise.resolve()),
		showErrorToastMock: vi.fn(),
	}));

vi.mock("#lib/api/error-toast.ts", () => ({
	showErrorToast: showErrorToastMock,
}));

vi.mock("#lib/app-data/preferences.svelte.ts", () => ({
	getPreferences: getPreferencesMock,
	setPreferences: setPreferencesMock,
}));

import {
	defaultRightNowFeedFilters,
	type RightNowFeedFilters,
} from "#lib/model/right-now/filters.ts";
import { RightNowFeedFiltersState } from "./right-now-feed-filters-state.svelte";

const saved: RightNowFeedFilters = {
	...defaultRightNowFeedFilters,
	sort: "DISTANCE",
	ageEnabled: true,
	age: [25, 40],
};

async function loadedState(onQueryChange = vi.fn()) {
	const state = new RightNowFeedFiltersState({ onQueryChange });
	await state.ready;
	return { state, onQueryChange };
}

beforeEach(() => {
	getPreferencesMock.mockReset();
	setPreferencesMock.mockClear();
	showErrorToastMock.mockReset();
	getPreferencesMock.mockResolvedValue({ rightNowFeedFilters: saved });
});

afterEach(() => {
	vi.restoreAllMocks();
});

it("loads and saves the Right Now feed filters", async () => {
	const { state } = await loadedState();
	expect(state.value).toEqual(saved);

	state.set({ hostingEnabled: true });

	expect(setPreferencesMock).toHaveBeenCalledExactlyOnceWith({
		rightNowFeedFilters: { ...saved, hostingEnabled: true },
	});
});

it("names the Right Now filters in the load failure toast", async () => {
	getPreferencesMock.mockRejectedValue(new Error("offline"));
	vi.spyOn(console, "error").mockImplementation(() => {});

	await loadedState();

	expect(showErrorToastMock).toHaveBeenCalledExactlyOnceWith({
		label: "Failed to load Right Now filters",
		error: expect.any(Error),
	});
});
