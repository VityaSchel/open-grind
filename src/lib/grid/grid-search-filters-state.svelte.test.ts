import { beforeEach, describe, expect, it, vi } from "vitest";

const { getPreferencesMock, setPreferencesMock, getTagsMock } = vi.hoisted(
	() => ({
		getPreferencesMock: vi.fn(),
		setPreferencesMock: vi.fn(() => Promise.resolve()),
		getTagsMock: vi.fn(),
	}),
);

vi.mock("#lib/api/users/tags.ts", () => ({ getTags: getTagsMock }));

vi.mock("#lib/app-data/preferences.svelte.ts", () => ({
	getPreferences: getPreferencesMock,
	setPreferences: setPreferencesMock,
}));

import { GridSearchFiltersState } from "#lib/grid/grid-search-filters-state.svelte.ts";
import { defaultFilters } from "#lib/model/browse/grid/filters.ts";

const languages = [
	{
		language: "en",
		categoryCollection: [
			{
				text: "Interests",
				possessiveText: null,
				tags: [{ tagId: 1, key: "hiking", text: "Hiking" }],
			},
		],
	},
];

async function loadedState(onQueryChange = vi.fn()) {
	const state = new GridSearchFiltersState({ onQueryChange });
	await state.ready;
	return { state, onQueryChange };
}

beforeEach(() => {
	getPreferencesMock.mockReset();
	setPreferencesMock.mockClear();
	getTagsMock.mockReset();
	getTagsMock.mockResolvedValue(languages);
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

describe("resetFilters", () => {
	it("saves the defaults and queries again", async () => {
		const { state, onQueryChange } = await loadedState();

		state.resetFilters();

		expect(state.value).toEqual(defaultFilters);
		expect(setPreferencesMock).toHaveBeenCalledOnce();
		expect(onQueryChange).toHaveBeenCalledOnce();
	});
});

describe("resolveTagKeys", () => {
	const savedTags = (tags: string[], tagsEnabled = true) =>
		getPreferencesMock.mockResolvedValue({
			gridSearchFilters: { ...defaultFilters, tagsEnabled, tags },
		});

	it("replaces saved tag texts with their keys", async () => {
		savedTags(["Hiking", "unknown"]);
		const { state, onQueryChange } = await loadedState();

		await state.resolveTagKeys();

		expect(state.value?.tags).toEqual(["hiking", "unknown"]);
		expect(setPreferencesMock).toHaveBeenCalledOnce();
		expect(onQueryChange).not.toHaveBeenCalled();
	});

	it("skips the tags request when the tags filter sends nothing", async () => {
		savedTags(["Hiking"], false);
		const { state } = await loadedState();

		await state.resolveTagKeys();

		expect(getTagsMock).not.toHaveBeenCalled();
		expect(state.value?.tags).toEqual(["Hiking"]);
	});

	it("replaces texts that arrive after an earlier run", async () => {
		savedTags(["hiking"]);
		const { state } = await loadedState();
		await state.resolveTagKeys();

		state.set({ tags: ["Hiking", "Hiking"] });
		await state.resolveTagKeys();

		expect(state.value?.tags).toEqual(["hiking"]);
	});

	it("keeps tags the user changed while the tag list was loading", async () => {
		savedTags(["Hiking"]);
		const { promise, resolve } = Promise.withResolvers<unknown[]>();
		getTagsMock.mockReturnValueOnce(promise);
		const { state } = await loadedState();

		const resolving = state.resolveTagKeys();
		state.set({ tags: ["gaming"] });
		resolve(languages);
		await resolving;

		expect(state.value?.tags).toEqual(["gaming"]);
		expect(setPreferencesMock).toHaveBeenCalledOnce();
	});

	it("gives up on a tag list that never loads", async () => {
		savedTags(["Hiking"]);
		getTagsMock.mockReturnValueOnce(new Promise(() => {}));
		vi.spyOn(console, "error").mockImplementation(() => {});
		vi.useFakeTimers();
		const { state } = await loadedState();

		const resolving = state.resolveTagKeys();
		await vi.advanceTimersByTimeAsync(5_000);
		await resolving;
		vi.useRealTimers();

		expect(state.value?.tags).toEqual(["Hiking"]);
	});

	it("tries again after the tags request fails", async () => {
		savedTags(["Hiking"]);
		getTagsMock.mockRejectedValueOnce(new Error("offline"));
		vi.spyOn(console, "error").mockImplementation(() => {});
		const { state } = await loadedState();

		await state.resolveTagKeys();
		expect(state.value?.tags).toEqual(["Hiking"]);

		await state.resolveTagKeys();
		expect(state.value?.tags).toEqual(["hiking"]);
	});
});
