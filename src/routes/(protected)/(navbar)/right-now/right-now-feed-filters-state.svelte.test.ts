import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

import { clearAccountCaches } from "#lib/api/account-caches.ts";
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

describe("loading", () => {
	it("loads the saved filters", async () => {
		const { state } = await loadedState();

		expect(state.value).toEqual(saved);
	});

	it("falls back to the defaults when nothing is saved", async () => {
		getPreferencesMock.mockResolvedValue({});

		const { state } = await loadedState();

		expect(state.value).toEqual(defaultRightNowFeedFilters);
	});

	it("keeps a change made before the saved filters finish loading", async () => {
		const { promise, resolve } = Promise.withResolvers<unknown>();
		getPreferencesMock.mockReturnValueOnce(promise);
		const state = new RightNowFeedFiltersState({ onQueryChange: vi.fn() });

		state.set({ hostingEnabled: true });
		resolve({ rightNowFeedFilters: saved });
		await state.ready;

		expect(state.value).toEqual({
			...defaultRightNowFeedFilters,
			hostingEnabled: true,
		});
	});

	it("shows a toast when the saved filters fail to load", async () => {
		getPreferencesMock.mockRejectedValue(new Error("offline"));
		vi.spyOn(console, "error").mockImplementation(() => {});

		await loadedState();

		expect(showErrorToastMock).toHaveBeenCalledExactlyOnceWith({
			label: "Failed to load Right Now filters",
			error: expect.any(Error),
		});
	});
});

describe("set", () => {
	it("saves the merged filters and queries again", async () => {
		const { state, onQueryChange } = await loadedState();

		state.set({ hostingEnabled: true });

		const merged = { ...saved, hostingEnabled: true };
		expect(state.value).toEqual(merged);
		expect(setPreferencesMock).toHaveBeenCalledExactlyOnceWith({
			rightNowFeedFilters: merged,
		});
		expect(onQueryChange).toHaveBeenCalledOnce();
	});

	it("ignores a patch equal to the current filters", async () => {
		const { state, onQueryChange } = await loadedState();

		state.set({ sort: "DISTANCE", age: [25, 40] });

		expect(setPreferencesMock).not.toHaveBeenCalled();
		expect(onQueryChange).not.toHaveBeenCalled();
	});

	it("stops saving once the account changed", async () => {
		const { state } = await loadedState();

		clearAccountCaches();
		state.set({ hostingEnabled: true });

		expect(state.value?.hostingEnabled).toBe(true);
		expect(setPreferencesMock).not.toHaveBeenCalled();
	});
});

describe("resetFilters", () => {
	it("restores and saves the defaults, then queries again", async () => {
		const { state, onQueryChange } = await loadedState();

		state.resetFilters();

		expect(state.value).toEqual(defaultRightNowFeedFilters);
		expect(setPreferencesMock).toHaveBeenCalledExactlyOnceWith({
			rightNowFeedFilters: defaultRightNowFeedFilters,
		});
		expect(onQueryChange).toHaveBeenCalledOnce();
	});
});
