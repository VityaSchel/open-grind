import { beforeEach, describe, expect, it, vi } from "vitest";

const { getGridMock, patchCachedProfileMock, reconcileHandlers } = vi.hoisted(
	() => ({
		getGridMock: vi.fn(),
		patchCachedProfileMock: vi.fn(),
		reconcileHandlers: [] as (() => unknown)[],
	}),
);

vi.mock("./grid", () => ({
	getGrid: getGridMock,
	getCachedProfile: () => undefined,
	patchCachedProfile: patchCachedProfileMock,
	resolveLazyProfile: vi.fn(),
	setCachedProfile: vi.fn(),
}));
vi.mock("$lib/util/reconcile", () => ({
	reconciler: {
		subscribe: (handler: () => unknown) => {
			reconcileHandlers.push(handler);
			return () => {};
		},
	},
}));
vi.mock("$lib/app-data/preferences.svelte", () => ({
	getPreferences: () => Promise.resolve({}),
	setPreferences: vi.fn(),
}));

import { mergeProfileEditIntoCaches } from "$lib/api/users/profiles";
import type { GridProfile } from "./grid";
import { gridState } from "./grid-state.svelte";

const page = (ids: number[]) => ({
	items: ids.map((id) => ({ id, type: "lazy" })),
	nextPage: null,
});

async function settle() {
	await vi.waitFor(() => expect(getGridMock).toHaveBeenCalled());
	await Promise.resolve();
}

beforeEach(async () => {
	getGridMock.mockReset();
	getGridMock.mockResolvedValue(page([1]));
	gridState.reset();
	gridState.load("9q8yyk8ytpxr");
	await settle();
	getGridMock.mockReset();
	getGridMock.mockResolvedValue(page([2]));
});

describe("grid reconciliation", () => {
	it("subscribes to the reconciler", () => {
		expect(reconcileHandlers).toHaveLength(1);
	});

	it("replaces the grid without emptying it first", async () => {
		const during: number[][] = [];
		getGridMock.mockImplementation(() => {
			during.push(gridState.items.map((item) => item.id));
			return Promise.resolve(page([2]));
		});

		await reconcileHandlers[0]?.();

		expect(during).toEqual([[1]]);
		expect(gridState.items.map((item) => item.id)).toEqual([2]);
		expect(gridState.loading).toBe(false);
	});

	it("does nothing until a location has been loaded", async () => {
		gridState.reset();

		await reconcileHandlers[0]?.();

		expect(getGridMock).not.toHaveBeenCalled();
	});
});

describe("grid favorites", () => {
	const PROFILE_ID = 100001;

	function rendered(isFavorite: boolean): GridProfile {
		return {
			type: "rendered",
			id: PROFILE_ID,
			displayName: "Ada",
			distance: 100,
			profilePhotosHashes: ["a"],
			unread: 0,
			onlineUntil: null,
			isFavorite,
			isVisiting: false,
			hasChattedInLast24Hrs: false,
		};
	}

	function edit(isFavorite: boolean, profileId = PROFILE_ID) {
		mergeProfileEditIntoCaches({
			cacheProfileId: profileId,
			patch: { isFavorite },
		});
	}

	beforeEach(() => {
		patchCachedProfileMock.mockReset();
	});

	it("follows a favorite added and removed elsewhere, list and cache", () => {
		gridState.items = [rendered(false)];

		edit(true);

		expect(gridState.items[0]).toMatchObject({ isFavorite: true });
		expect(patchCachedProfileMock).toHaveBeenLastCalledWith({
			id: PROFILE_ID,
			patch: { isFavorite: true },
		});

		edit(false);

		expect(gridState.items[0]).toMatchObject({ isFavorite: false });
		expect(patchCachedProfileMock).toHaveBeenLastCalledWith({
			id: PROFILE_ID,
			patch: { isFavorite: false },
		});
	});

	it("ignores an edit that carries no favorite", () => {
		gridState.items = [rendered(false)];

		mergeProfileEditIntoCaches({
			cacheProfileId: PROFILE_ID,
			patch: { displayName: "Renamed" },
		});

		expect(patchCachedProfileMock).not.toHaveBeenCalled();
		expect(gridState.items[0]).toMatchObject({ isFavorite: false });
	});

	it("leaves an unresolved tile alone but still patches the cache", () => {
		gridState.items = [
			{ type: "lazy", id: PROFILE_ID, unread: 0, isVisiting: false },
		];

		edit(true);

		expect(gridState.items[0]).toEqual({
			type: "lazy",
			id: PROFILE_ID,
			unread: 0,
			isVisiting: false,
		});
		expect(patchCachedProfileMock).toHaveBeenCalledOnce();
	});
});
