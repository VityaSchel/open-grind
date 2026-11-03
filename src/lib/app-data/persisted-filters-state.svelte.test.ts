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
import { PersistedFiltersState } from "./persisted-filters-state.svelte";

const options = {
	key: "rightNowFeedFilters",
	defaults: defaultRightNowFeedFilters,
	labels: { load: "Failed to load", save: "Failed to save" },
} as const;

const saved: RightNowFeedFilters = {
	...defaultRightNowFeedFilters,
	sort: "DISTANCE",
	ageEnabled: true,
	age: [25, 40],
};

async function loadedState(onQueryChange = vi.fn()) {
	const state = new PersistedFiltersState({ ...options, onQueryChange });
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
		const state = new PersistedFiltersState({
			...options,
			onQueryChange: vi.fn(),
		});

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
			label: "Failed to load",
			error: expect.any(Error),
		});
	});
});

describe("current", () => {
	it("falls back to the defaults before the saved filters load", () => {
		const state = new PersistedFiltersState({
			...options,
			onQueryChange: vi.fn(),
		});

		expect(state.current).toEqual(defaultRightNowFeedFilters);
	});
});

describe("snapshot", () => {
	it("falls back to the defaults before the saved filters load", () => {
		const state = new PersistedFiltersState({
			...options,
			onQueryChange: vi.fn(),
		});

		expect(state.snapshot()).toEqual(defaultRightNowFeedFilters);
	});

	it("detaches the copy from the stored filters", async () => {
		const { state } = await loadedState();

		const snapshot = state.snapshot();
		snapshot.age = [30, 50];

		expect(state.value?.age).toEqual([25, 40]);
	});
});

describe("set", () => {
	it("saves the merged filters under the key and queries again", async () => {
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

	it("applies a patch that only reorders a nested list", async () => {
		const { state, onQueryChange } = await loadedState();

		state.set({ age: [40, 25] });

		expect(state.value?.age).toEqual([40, 25]);
		expect(setPreferencesMock).toHaveBeenCalledOnce();
		expect(onQueryChange).toHaveBeenCalledOnce();
	});

	it("shows a toast when the filters fail to save", async () => {
		setPreferencesMock.mockRejectedValueOnce(new Error("disk full"));
		vi.spyOn(console, "error").mockImplementation(() => {});
		const { state } = await loadedState();

		state.set({ hostingEnabled: true });

		await vi.waitFor(() => {
			expect(showErrorToastMock).toHaveBeenCalledExactlyOnceWith({
				label: "Failed to save",
				error: expect.any(Error),
			});
		});
	});
});

describe("reset", () => {
	it("restores the defaults without saving or querying", async () => {
		const { state, onQueryChange } = await loadedState();

		state.reset();

		expect(state.value).toEqual(defaultRightNowFeedFilters);
		expect(setPreferencesMock).not.toHaveBeenCalled();
		expect(onQueryChange).not.toHaveBeenCalled();
	});

	it("saves for the next account only once the account change resets it", async () => {
		const { state } = await loadedState();

		clearAccountCaches();
		state.set({ hostingEnabled: true });
		expect(setPreferencesMock).not.toHaveBeenCalled();

		state.reset();
		state.set({ sort: "DISTANCE" });

		expect(setPreferencesMock).toHaveBeenCalledExactlyOnceWith({
			rightNowFeedFilters: {
				...defaultRightNowFeedFilters,
				sort: "DISTANCE",
			},
		});
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
