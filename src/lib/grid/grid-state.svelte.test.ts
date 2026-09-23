import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	getGridMock,
	getTagsMock,
	patchCachedProfileMock,
	reconcileHandlers,
	showErrorToastMock,
	resolveGeohashMock,
	resolveLazyProfileMock,
	setPreferencesMock,
	storedPreferences,
} = vi.hoisted(() => ({
	getGridMock: vi.fn(),
	getTagsMock: vi.fn(),
	patchCachedProfileMock: vi.fn(),
	reconcileHandlers: [] as (() => unknown)[],
	resolveGeohashMock: vi.fn(),
	resolveLazyProfileMock: vi.fn(),
	setPreferencesMock: vi.fn(),
	showErrorToastMock: vi.fn(),
	storedPreferences: { geohash: null as string | null },
}));

vi.mock("./grid", () => ({
	getGrid: getGridMock,
	getCachedProfile: () => undefined,
	patchCachedProfile: patchCachedProfileMock,
	resolveLazyProfile: resolveLazyProfileMock,
	setCachedProfile: vi.fn(),
}));
vi.mock("$lib/api/users/tags", () => ({ getTags: getTagsMock }));
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
	preferencesSnapshot: () => storedPreferences,
	setPreferences: setPreferencesMock,
}));
vi.mock("$lib/api/error-toast", () => ({ showErrorToast: showErrorToastMock }));
vi.mock("$lib/location/auto-location", () => ({
	autoLocation: { resolveGeohash: resolveGeohashMock },
	BACKGROUND_FIX_MAX_AGE_MS: 6 * 60 * 1000,
}));

import { clearAccountCaches } from "$lib/api/account-caches";
import {
	markProfileUnviewable,
	markProfileViewable,
} from "$lib/api/users/profile-viewability";
import { mergeProfileEditIntoCaches } from "$lib/api/users/profiles";
import { defaultFilters } from "$lib/model/browse/grid/filters";
import { gridState } from "./grid-state.svelte";
import { rendered } from "./grid-test-helpers";

const page = (
	ids: number[],
	{ nextPage = null }: { nextPage?: number | null } = {},
) => ({ items: ids.map((id) => ({ id, type: "lazy" })), nextPage });

async function settle() {
	await vi.waitFor(() => expect(getGridMock).toHaveBeenCalled());
	await Promise.resolve();
}

beforeEach(async () => {
	clearAccountCaches();
	storedPreferences.geohash = null;
	gridState.viewActive = false;
	resolveGeohashMock.mockReset();
	resolveGeohashMock.mockImplementation((geohash: string) =>
		Promise.resolve(geohash),
	);
	setPreferencesMock.mockReset();
	setPreferencesMock.mockResolvedValue(undefined);
	getGridMock.mockReset();
	getGridMock.mockResolvedValue(page([1]));
	gridState.reset();
	gridState.load("9q8yyk8ytpxr");
	await settle();
	getGridMock.mockReset();
	getGridMock.mockResolvedValue(page([2]));
});

describe("grid tag keys", () => {
	it("sends tag keys for tag texts saved by an older version", async () => {
		getTagsMock.mockResolvedValue([
			{
				language: "en",
				categoryCollection: [
					{
						text: "Fitness",
						possessiveText: null,
						tags: [{ tagId: 1, key: "gym", text: "Working Out" }],
					},
				],
			},
		]);
		gridState.filters.value = {
			...defaultFilters,
			tagsEnabled: true,
			tags: ["Working Out"],
		};

		gridState.retry();
		await settle();

		expect(getGridMock).toHaveBeenCalledWith(
			expect.objectContaining({ tags: ["gym"] }),
		);
	});
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

describe("grid blocking", () => {
	it("removes a tile whose profile became unviewable", () => {
		gridState.items = [
			{ type: "lazy", id: 1, unread: 0, isVisiting: false },
			{ type: "lazy", id: 2, unread: 0, isVisiting: false },
		];

		markProfileUnviewable(1);

		expect(gridState.items.map((item) => item.id)).toEqual([2]);
	});

	it("refetches the grid when a profile is unblocked", async () => {
		gridState.items = [
			{ type: "lazy", id: 1, unread: 0, isVisiting: false },
		];

		markProfileViewable(1);
		await settle();

		expect(gridState.items.map((item) => item.id)).toEqual([2]);
	});

	it("leaves the grid alone for a profile it does not hold", () => {
		gridState.items = [
			{ type: "lazy", id: 1, unread: 0, isVisiting: false },
		];

		markProfileUnviewable(3);

		expect(gridState.items.map((item) => item.id)).toEqual([1]);
	});
});

describe("grid favorites", () => {
	const PROFILE_ID = 100001;

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
		gridState.items = [rendered({ id: PROFILE_ID })];

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
		gridState.items = [rendered({ id: PROFILE_ID })];

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

describe("shared profile order", () => {
	it("dedupes the items into the order the grid renders", () => {
		gridState.items = [
			{ type: "lazy", id: 1, unread: 0, isVisiting: false },
			rendered({ id: 2 }),
			rendered({ id: 1 }),
			rendered({ id: 2 }),
		];

		expect(gridState.profiles).toEqual([
			rendered({ id: 1 }),
			rendered({ id: 2 }),
		]);
		expect(gridState.indexInProfiles(1)).toBe(0);
		expect(gridState.indexInProfiles(2)).toBe(1);
		expect(gridState.profileById(1)).toEqual(rendered({ id: 1 }));
	});

	it("answers -1 and null for a profile it does not list", () => {
		gridState.items = [rendered({ id: 1 })];

		expect(gridState.indexInProfiles(3)).toBe(-1);
		expect(gridState.profileById(3)).toBeNull();
	});

	it("removes every copy of a repeated profile", () => {
		gridState.items = [
			{ type: "lazy", id: 1, unread: 0, isVisiting: false },
			rendered({ id: 2 }),
			rendered({ id: 1 }),
		];

		gridState.removeProfile(1);

		expect(gridState.profiles).toEqual([rendered({ id: 2 })]);
		expect(gridState.indexInProfiles(1)).toBe(-1);
	});

	it("favorites the copy of a repeated profile that the order shows", () => {
		gridState.items = [
			{ type: "lazy", id: 1, unread: 0, isVisiting: false },
			rendered({ id: 2 }),
			rendered({ id: 1 }),
		];

		gridState.setFavorite({ profileId: 1, isFavorite: true });

		expect(gridState.profileById(1)).toEqual(
			rendered({ id: 1, isFavorite: true }),
		);
		expect(
			gridState.profileById(2),
			"favoriting one profile must not star its neighbors",
		).toEqual(rendered({ id: 2 }));
	});

	it("drops every copy of a repeated profile that cannot be resolved", async () => {
		resolveLazyProfileMock.mockResolvedValueOnce(null);
		gridState.items = [
			{ type: "lazy", id: 1, unread: 0, isVisiting: false },
			rendered({ id: 2 }),
			{ type: "lazy", id: 1, unread: 0, isVisiting: false },
		];

		await gridState.resolveProfile(1);

		expect(gridState.profiles).toEqual([rendered({ id: 2 })]);
	});
});

describe("reveal on return", () => {
	it("hands the revealed profile out once", () => {
		gridState.revealProfileId = 1;

		expect(gridState.consumeReveal()).toBe(1);
		expect(gridState.consumeReveal()).toBeNull();
		expect(gridState.revealProfileId).toBeNull();
	});

	it("forgets the revealed profile when the grid is retried", async () => {
		gridState.revealProfileId = 1;

		gridState.retry();
		await settle();

		expect(gridState.consumeReveal()).toBeNull();
	});

	it("forgets the revealed profile when the grid is reset", () => {
		gridState.revealProfileId = 1;

		gridState.reset();

		expect(gridState.consumeReveal()).toBeNull();
	});
});

describe("live location", () => {
	const NEXT = "u33dc0cpn3hy";

	it("fetches with the geohash the resolver returns and persists it", async () => {
		resolveGeohashMock.mockResolvedValue(NEXT);
		gridState.scrollY = 4000;

		await gridState.refresh();

		expect(getGridMock.mock.calls[0]?.[0]).toMatchObject({
			nearbyGeoHash: NEXT,
		});
		expect(setPreferencesMock).toHaveBeenCalledExactlyOnceWith({
			geohash: NEXT,
		});
		expect(gridState.items.map((item) => item.id)).toEqual([2]);
		expect(gridState.loading).toBe(false);
		expect(gridState.scrollY).toBe(4000);
	});

	it("makes the follow-up geohash effect a no-op instead of a reset", async () => {
		resolveGeohashMock.mockResolvedValue(NEXT);
		await gridState.refresh();
		getGridMock.mockClear();
		gridState.scrollY = 4000;

		gridState.load(NEXT);

		expect(getGridMock).not.toHaveBeenCalled();
		expect(gridState.items.map((item) => item.id)).toEqual([2]);
		expect(gridState.scrollY).toBe(4000);
	});

	it("resolves the location on the launch load, in the same fetch", async () => {
		gridState.reset();
		resolveGeohashMock.mockResolvedValue(NEXT);
		getGridMock.mockResolvedValue(page([2]));

		gridState.load("9q8yyk8ytpxr");
		await settle();

		expect(getGridMock).toHaveBeenCalledTimes(1);
		expect(getGridMock.mock.calls[0]?.[0]).toMatchObject({
			nearbyGeoHash: NEXT,
		});
		expect(setPreferencesMock).toHaveBeenCalledExactlyOnceWith({
			geohash: NEXT,
		});

		gridState.load(NEXT);
		expect(getGridMock).toHaveBeenCalledTimes(1);
	});

	it("keeps a manual pick to a different location disruptive", async () => {
		resolveGeohashMock.mockResolvedValue(NEXT);
		await gridState.refresh();
		getGridMock.mockClear();

		gridState.load("ezs42e44yx96");
		await settle();

		expect(gridState.scrollY).toBe(0);
	});

	it("leaves the grid alone when the resolver keeps the location", async () => {
		await gridState.refresh();

		expect(getGridMock.mock.calls[0]?.[0]).toMatchObject({
			nearbyGeoHash: "9q8yyk8ytpxr",
		});
		expect(setPreferencesMock).not.toHaveBeenCalled();
	});

	it("samples with the interactive max age for a manual refresh", async () => {
		resolveGeohashMock.mockClear();

		await gridState.refresh();

		expect(resolveGeohashMock).toHaveBeenLastCalledWith("9q8yyk8ytpxr", {
			background: false,
		});
	});

	it("samples with the background max age while the grid is on screen", async () => {
		resolveGeohashMock.mockClear();
		gridState.viewActive = true;

		await gridState.refresh({ background: true });

		expect(resolveGeohashMock).toHaveBeenLastCalledWith("9q8yyk8ytpxr", {
			background: true,
		});
	});

	it("never touches GPS for a background refresh away from the grid", async () => {
		resolveGeohashMock.mockClear();

		await gridState.refresh({ background: true });

		expect(resolveGeohashMock).not.toHaveBeenCalled();
		expect(getGridMock.mock.calls[0]?.[0]).toMatchObject({
			nearbyGeoHash: "9q8yyk8ytpxr",
		});
	});

	it("beats from the stored location when the grid was never opened", async () => {
		gridState.reset();
		storedPreferences.geohash = "u33dc0cpn3hy";
		resolveGeohashMock.mockClear();

		await gridState.refresh({ background: true });

		expect(resolveGeohashMock).not.toHaveBeenCalled();
		expect(getGridMock).toHaveBeenCalledOnce();
		expect(getGridMock.mock.calls[0]?.[0]).toMatchObject({
			nearbyGeoHash: "u33dc0cpn3hy",
		});
	});
});

describe("fetch races", () => {
	const NEXT = "u33dc0cpn3hy";

	function deferred<T>() {
		let resolve!: (value: T) => void;
		const promise = new Promise<T>((r) => {
			resolve = r;
		});
		return { promise, resolve };
	}

	it("a superseded fetch never persists or retargets its late fix", async () => {
		resolveGeohashMock.mockClear();
		const slowFix = deferred<string>();
		resolveGeohashMock.mockReturnValueOnce(slowFix.promise);
		const stale = gridState.refresh();
		await vi.waitFor(() => expect(resolveGeohashMock).toHaveBeenCalled());

		gridState.retry();
		await settle();

		slowFix.resolve(NEXT);
		await stale;

		expect(setPreferencesMock).not.toHaveBeenCalled();
		for (const call of getGridMock.mock.calls) {
			expect(call[0]).toMatchObject({ nearbyGeoHash: "9q8yyk8ytpxr" });
		}
	});

	it("a fix landing after sign-out cannot resurrect the old account", async () => {
		resolveGeohashMock.mockClear();
		const slowFix = deferred<string>();
		resolveGeohashMock.mockReturnValueOnce(slowFix.promise);
		const stale = gridState.refresh();
		await vi.waitFor(() => expect(resolveGeohashMock).toHaveBeenCalled());

		gridState.reset();
		slowFix.resolve(NEXT);
		await stale;

		expect(setPreferencesMock).not.toHaveBeenCalled();
		await reconcileHandlers[0]?.();
		expect(getGridMock).not.toHaveBeenCalled();
	});

	it("a pending page cannot append onto a retargeted grid", async () => {
		getGridMock.mockResolvedValueOnce({
			items: [{ id: 1, type: "lazy" }],
			nextPage: 2,
		});
		gridState.retry();
		await settle();
		getGridMock.mockReset();

		const slowFix = deferred<string>();
		resolveGeohashMock.mockReturnValueOnce(slowFix.promise);
		const refreshed = gridState.refresh();

		const slowPage = deferred<{ items: unknown[]; nextPage: null }>();
		getGridMock.mockReturnValueOnce(slowPage.promise);
		const paged = gridState.loadMore();

		getGridMock.mockResolvedValueOnce(page([2]));
		slowFix.resolve(NEXT);
		await refreshed;

		slowPage.resolve({ items: [{ id: 9, type: "lazy" }], nextPage: null });
		await paged;

		expect(gridState.items.map((item) => item.id)).toEqual([2]);
	});

	it("heartbeat failures stay silent; a pull-to-refresh failure does not", async () => {
		getGridMock.mockRejectedValue(new Error("offline"));
		await gridState.refresh({ background: true });
		expect(showErrorToastMock).not.toHaveBeenCalled();

		await gridState.refresh();
		expect(showErrorToastMock).toHaveBeenCalledTimes(1);
	});
});

describe("loaded pages", () => {
	const NEXT = "u33dc0cpn3hy";

	beforeEach(async () => {
		getGridMock.mockResolvedValueOnce(page([1, 2, 3], { nextPage: 1 }));
		gridState.retry();
		await settle();
		getGridMock.mockResolvedValueOnce(page([4, 5, 6], { nextPage: 2 }));
		await gridState.loadMore();
		getGridMock.mockResolvedValueOnce(page([7, 8, 9], { nextPage: 3 }));
		await gridState.loadMore();
		getGridMock.mockReset();
	});

	it("keeps pages past the first through a heartbeat beat", async () => {
		getGridMock.mockResolvedValue(page([1, 2, 3], { nextPage: 1 }));

		await gridState.refresh({ background: true });

		expect(gridState.items.map((item) => item.id)).toEqual([
			1, 2, 3, 4, 5, 6, 7, 8, 9,
		]);
		expect(gridState.nextPage).toBe(3);
		expect(getGridMock).toHaveBeenCalledOnce();
	});

	it("keeps them through a reconcile too", async () => {
		getGridMock.mockResolvedValue(page([1, 2, 3], { nextPage: 1 }));

		await reconcileHandlers[0]?.();

		expect(gridState.items.map((item) => item.id)).toEqual([
			1, 2, 3, 4, 5, 6, 7, 8, 9,
		]);
		expect(gridState.nextPage).toBe(3);
		expect(getGridMock).toHaveBeenCalledOnce();
	});

	it("lets the first page drop and reorder profiles, without duplicating", async () => {
		getGridMock.mockResolvedValue(page([3, 10, 7], { nextPage: 1 }));

		await gridState.refresh({ background: true });

		expect(gridState.items.map((item) => item.id)).toEqual([
			3, 10, 7, 4, 5, 6, 8, 9,
		]);
	});

	it("keeps the shared order in step with a re-head", async () => {
		getGridMock.mockResolvedValue(page([3, 10, 7], { nextPage: 1 }));

		await gridState.refresh({ background: true });

		expect(gridState.profiles.map((profile) => profile.id)).toEqual([
			3, 10, 7, 4, 5, 6, 8, 9,
		]);
		expect(gridState.indexInProfiles(10)).toBe(1);
		expect(gridState.indexInProfiles(8)).toBe(6);
		expect(gridState.indexInProfiles(1)).toBe(-1);
		expect(gridState.profileById(1)).toBeNull();
	});

	it("keeps the revealed profile through a background re-head", async () => {
		gridState.revealProfileId = 8;
		getGridMock.mockResolvedValue(page([3, 10, 7], { nextPage: 1 }));

		await gridState.refresh({ background: true });

		expect(gridState.consumeReveal()).toBe(8);
	});

	it("keeps the shared order in step with a removed profile", () => {
		gridState.removeProfile(5);

		expect(gridState.profiles.map((profile) => profile.id)).toEqual([
			1, 2, 3, 4, 6, 7, 8, 9,
		]);
		expect(gridState.indexInProfiles(5)).toBe(-1);
		expect(gridState.indexInProfiles(6)).toBe(4);
	});

	it("keeps the shared order in step with an appended page", async () => {
		getGridMock.mockResolvedValue(page([10, 11], { nextPage: 4 }));

		await gridState.loadMore();

		expect(gridState.profiles).toHaveLength(11);
		expect(gridState.indexInProfiles(11)).toBe(10);
		expect(gridState.profileById(11)).toEqual({ id: 11, type: "lazy" });
	});

	it("starts the grid over for a pull-to-refresh", async () => {
		getGridMock.mockResolvedValue(page([1, 2, 3], { nextPage: 1 }));

		await gridState.refresh({ keepLoadedPages: false });

		expect(gridState.items.map((item) => item.id)).toEqual([1, 2, 3]);
		expect(gridState.nextPage).toBe(1);
	});

	it("starts the grid over when a beat retargets the location", async () => {
		resolveGeohashMock.mockResolvedValue(NEXT);
		gridState.viewActive = true;
		getGridMock.mockResolvedValue(page([10, 11], { nextPage: 1 }));

		await gridState.refresh({ background: true });

		expect(gridState.items.map((item) => item.id)).toEqual([10, 11]);
		expect(gridState.nextPage).toBe(1);
	});

	it("keeps a removed tile out of the kept pages", async () => {
		gridState.removeProfile(5);
		getGridMock.mockResolvedValue(page([1, 2, 3], { nextPage: 1 }));

		await gridState.refresh({ background: true });

		expect(gridState.items.map((item) => item.id)).toEqual([
			1, 2, 3, 4, 6, 7, 8, 9,
		]);
		expect(getGridMock).toHaveBeenCalledOnce();
	});

	it("stops paging once the shrunken grid runs out", async () => {
		getGridMock.mockResolvedValue(page([1, 2, 3], { nextPage: 1 }));
		await gridState.refresh({ background: true });

		getGridMock.mockResolvedValue(page([]));
		await gridState.loadMore();

		expect(getGridMock).toHaveBeenLastCalledWith(
			expect.objectContaining({ pageNumber: 3 }),
		);
		expect(gridState.nextPage).toBeNull();
		expect(gridState.items.map((item) => item.id)).toEqual([
			1, 2, 3, 4, 5, 6, 7, 8, 9,
		]);
	});

	it("skips profiles the next page repeats after a kept refresh", async () => {
		getGridMock.mockResolvedValue(page([1, 2, 3], { nextPage: 1 }));
		await gridState.refresh({ background: true });

		getGridMock.mockResolvedValue(page([8, 10, 2, 11], { nextPage: 4 }));
		await gridState.loadMore();

		expect(gridState.items.map((item) => item.id)).toEqual([
			1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11,
		]);
		expect(gridState.nextPage).toBe(4);
	});

	it("retries a failed refresh the way it was made", async () => {
		showErrorToastMock.mockClear();
		getGridMock.mockRejectedValueOnce(new Error("offline"));

		await gridState.refresh();

		const { onRetry } = showErrorToastMock.mock.calls[0]![0] as {
			onRetry: () => void;
		};
		getGridMock.mockResolvedValue(page([3, 1, 2], { nextPage: 1 }));
		onRetry();

		await vi.waitFor(() =>
			expect(gridState.items.map((item) => item.id)).toEqual([
				3, 1, 2, 4, 5, 6, 7, 8, 9,
			]),
		);
		expect(gridState.nextPage).toBe(3);
		expect(getGridMock).toHaveBeenCalledTimes(2);
	});
});
