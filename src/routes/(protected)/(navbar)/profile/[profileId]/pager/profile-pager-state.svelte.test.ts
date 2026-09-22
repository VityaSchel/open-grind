import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getProfileMock, recordProfileVisitMock, forgetProfileVisitsMock } =
	vi.hoisted(() => ({
		getProfileMock: vi.fn<(profileId: number) => Promise<Profile>>(),
		recordProfileVisitMock:
			vi.fn<
				(visit: {
					profileId: number;
					ourProfileId: number;
				}) => Promise<void>
			>(),
		forgetProfileVisitsMock: vi.fn<() => void>(),
	}));

vi.mock("$lib/api/error-toast", () => ({ showErrorToast: vi.fn() }));
vi.mock("$lib/api/users/favorites", () => ({
	getFavoriteNote: vi.fn(),
	invalidateFavoriteNote: vi.fn(),
}));
vi.mock("$lib/api/users/profiles", async (importOriginal) => ({
	...(await importOriginal<typeof import("$lib/api/users/profiles")>()),
	getProfile: getProfileMock,
	refreshProfile: vi.fn(),
	isProfileCached: () => true,
}));
vi.mock("../record-visit", () => ({
	recordProfileVisit: recordProfileVisitMock,
	forgetProfileVisits: forgetProfileVisitsMock,
}));

import { clearAccountCaches } from "$lib/api/account-caches";
import {
	markProfileUnviewable,
	markProfileViewable,
} from "$lib/api/users/profile-viewability";
import type { Profile } from "$lib/model/users/profiles";
import {
	destroyOpenedPagers,
	flush,
	gridSource,
	mountedPositions,
	openPager,
	OUR_ID,
	range,
	row,
} from "./profile-pager-test-helpers";

const fetchCount = (profileId: number) =>
	getProfileMock.mock.calls.filter(([id]) => id === profileId).length;

const recordedIds = () =>
	recordProfileVisitMock.mock.calls.map(([{ profileId }]) => profileId);

beforeEach(() => {
	vi.clearAllMocks();
	clearAccountCaches();
	getProfileMock.mockImplementation((profileId: number) =>
		Promise.resolve({ profileId, isFavorite: false } as Profile),
	);
	recordProfileVisitMock.mockResolvedValue(undefined);
});

afterEach(destroyOpenedPagers);

describe("ProfilePagerState track", () => {
	it("opens a Browse entry at its place in the grid order, without our own profile", () => {
		const pager = openPager({
			source: gridSource({ ids: [1, 2, OUR_ID, 3, 4] }),
			profileId: 3,
		});

		expect(pager.track).toEqual([1, 2, 3, 4]);
		expect(pager.activePosition).toBe(2);
		expect(pager.activeId).toBe(3);
	});

	it("reaches at most 100 profiles to each side of the entry", () => {
		const pager = openPager({
			source: gridSource({ ids: range(1, 300) }),
			profileId: 151,
		});

		expect(pager.track).toEqual(range(51, 251));
		expect(pager.activePosition).toBe(100);
	});

	it("extends the track by 100 once a visible position is within five of its end", () => {
		const pager = openPager({
			source: gridSource({ ids: range(1, 300) }),
			profileId: 1,
		});
		expect(pager.track).toHaveLength(101);

		pager.setVisiblePositions({ first: 94, last: 95 });
		expect(pager.track).toHaveLength(101);

		pager.setVisiblePositions({ first: 95, last: 96 });
		expect(pager.track).toEqual(range(1, 201));
	});

	it("extends the track by 100 once the pager lands within five of its end", () => {
		const pager = openPager({
			source: gridSource({ ids: range(1, 300) }),
			profileId: 1,
		});

		pager.commit({ position: 95 });
		expect(pager.track).toHaveLength(101);

		pager.commit({ position: 96 });
		expect(pager.track).toEqual(range(1, 201));
	});

	it("opens one stop with no grid row when the profile was not opened from Browse", () => {
		const source = gridSource({ ids: [1, 2, 3], nextPage: 1 });
		const pager = openPager({ source, profileId: 2, origin: null });

		expect(pager.track).toEqual([2]);
		expect(mountedPositions(pager)).toEqual([0]);
		expect(pager.row(2)).toBeNull();
		expect(pager.heroHash(2)).toBeNull();
		expect(source.loadMore).not.toHaveBeenCalled();
	});

	it("opens one stop that never grows when the entry is missing from the grid", () => {
		const source = gridSource({ ids: [1, 2, 3], nextPage: 1 });
		const pager = openPager({ source, profileId: 50 });

		source.profiles = [50, 51, 52].map(row);
		pager.absorbGridGrowth();

		expect(pager.track).toEqual([50]);
		expect(source.loadMore).not.toHaveBeenCalled();
	});
});

describe("ProfilePagerState navigation", () => {
	it("ignores a commit to the active position or past the track", () => {
		const source = gridSource({ ids: range(1, 5) });
		const pager = openPager({ source, profileId: 3 });

		expect(pager.commit({ position: 2 })).toBeNull();
		expect(pager.commit({ position: 5 })).toBeNull();

		expect(pager.activeId).toBe(3);
		expect(recordedIds()).toEqual([3]);
		expect(source.revealProfileId).toBeNull();
	});

	it("marks the landed profile for the grid to reveal, which only a fresh entry clears", () => {
		const source = gridSource({ ids: range(1, 10) });
		const pager = openPager({ source, profileId: 6 });

		pager.commit({ position: 6 });
		expect(source.revealProfileId).toBe(7);

		pager.reset({
			profileId: 7,
			ourProfileId: OUR_ID,
			origin: "browse",
			historyTraversal: true,
		});
		expect(source.revealProfileId).toBe(7);

		pager.reset({
			profileId: 2,
			ourProfileId: OUR_ID,
			origin: "browse",
			historyTraversal: false,
		});
		expect(source.revealProfileId).toBeNull();
	});

	it("resets for any navigation it did not issue itself", () => {
		const pager = openPager({
			source: gridSource({ ids: range(1, 10) }),
			profileId: 6,
		});
		pager.commit({ position: 6 });
		pager.commit({ position: 7 });
		const entry = { ourProfileId: OUR_ID, origin: "browse" } as const;

		expect(pager.needsReset({ ...entry, profileId: 8 })).toBe(false);
		expect(pager.needsReset({ ...entry, profileId: 7 })).toBe(false);
		expect(pager.needsReset({ ...entry, profileId: 6 })).toBe(true);
		expect(pager.needsReset({ ...entry, profileId: 7, origin: null })).toBe(
			true,
		);
		expect(
			pager.needsReset({ ...entry, profileId: 8, ourProfileId: 1 }),
		).toBe(true);
	});

	it("does not reset for the profile it shows, even one it never issued", () => {
		const source = gridSource({ ids: range(1, 10) });
		const browsed = openPager({ source, profileId: 6 });
		const alone = openPager({ source, profileId: 2, origin: null });

		expect(
			browsed.needsReset({
				profileId: 6,
				ourProfileId: OUR_ID,
				origin: "browse",
			}),
		).toBe(false);
		expect(
			alone.needsReset({
				profileId: 2,
				ourProfileId: OUR_ID,
				origin: null,
			}),
		).toBe(false);
	});

	it("forgets the profiles it issued once reset", () => {
		const pager = openPager({
			source: gridSource({ ids: range(1, 10) }),
			profileId: 6,
		});
		pager.commit({ position: 6 });

		pager.reset({
			profileId: 2,
			ourProfileId: OUR_ID,
			origin: null,
			historyTraversal: false,
		});

		expect(
			pager.needsReset({
				profileId: 7,
				ourProfileId: OUR_ID,
				origin: "browse",
			}),
		).toBe(true);
	});
});

describe("ProfilePagerState views", () => {
	it("records the entry once and nothing for mounted neighbors", async () => {
		const pager = openPager({
			source: gridSource({ ids: range(1, 10) }),
			profileId: 6,
		});
		pager.setVisiblePositions({ first: 5, last: 6 });
		pager.setVisiblePositions({ first: 2, last: 3 });
		await flush();

		expect(getProfileMock.mock.calls.length).toBeGreaterThan(3);
		expect(recordProfileVisitMock).toHaveBeenCalledExactlyOnceWith({
			profileId: 6,
			ourProfileId: OUR_ID,
		});
	});

	it("records every profile the pager lands on", () => {
		const pager = openPager({
			source: gridSource({ ids: range(1, 10) }),
			profileId: 6,
		});

		pager.commit({ position: 6 });
		pager.commit({ position: 5 });
		pager.commit({ position: 6 });
		pager.commit({ position: 7 });

		expect(recordedIds()).toEqual([6, 7, 6, 7, 8]);
	});

	it("forgets the recorded visits before recording a fresh entry", () => {
		const pager = openPager({
			source: gridSource({ ids: range(1, 10) }),
			profileId: 6,
		});
		pager.commit({ position: 6 });
		vi.clearAllMocks();

		pager.reset({
			profileId: 7,
			ourProfileId: OUR_ID,
			origin: "browse",
			historyTraversal: false,
		});

		expect(forgetProfileVisitsMock).toHaveBeenCalledOnce();
		expect(forgetProfileVisitsMock).toHaveBeenCalledBefore(
			recordProfileVisitMock,
		);
		expect(recordedIds()).toEqual([7]);
	});

	it("keeps the recorded visits when history returns to the pager", () => {
		openPager({
			source: gridSource({ ids: range(1, 10) }),
			profileId: 7,
			historyTraversal: true,
		});

		expect(forgetProfileVisitsMock).not.toHaveBeenCalled();
		expect(recordedIds()).toEqual([7]);
	});
});

describe("ProfilePagerState grid rows", () => {
	it("prefers the live grid row and falls back to the one seen at entry", () => {
		const source = gridSource({ ids: range(1, 5) });
		const pager = openPager({ source, profileId: 3 });
		const favorited = { ...row(4), isFavorite: true };

		source.profiles = [...range(1, 3).map(row), favorited, row(5)];
		expect(pager.row(4)).toBe(favorited);

		source.profiles = [1, 2, 3, 5].map(row);
		expect(pager.row(4)).toEqual(row(4));
		expect(pager.heroHash(4)).toBe("photo-4");
	});

	it("drops the hero photo of a profile that becomes unviewable, and restores it once viewable", () => {
		const pager = openPager({
			source: gridSource({ ids: range(1, 5) }),
			profileId: 3,
		});

		markProfileUnviewable(4);
		expect(pager.heroHash(4)).toBeNull();
		expect(pager.heroHash(2)).toBe("photo-2");

		markProfileViewable(4);
		expect(pager.heroHash(4)).toBe("photo-4");
	});

	it("shows no hero photo for a profile that was unviewable at entry", () => {
		markProfileUnviewable(4);

		const pager = openPager({
			source: gridSource({ ids: range(1, 5) }),
			profileId: 3,
		});

		expect(pager.track).toEqual(range(1, 5));
		expect(pager.heroHash(4)).toBeNull();
	});

	it("shows the hero photo again after a sign-out and a reset for the next account", () => {
		markProfileUnviewable(4);
		const pager = openPager({
			source: gridSource({ ids: range(1, 5) }),
			profileId: 3,
		});

		clearAccountCaches();
		pager.reset({
			profileId: 3,
			ourProfileId: OUR_ID + 1,
			origin: "browse",
			historyTraversal: false,
		});

		expect(pager.heroHash(4)).toBe("photo-4");
	});

	it("stops following viewability once destroyed", () => {
		const pager = openPager({
			source: gridSource({ ids: range(1, 5) }),
			profileId: 3,
		});

		pager.destroy();
		markProfileUnviewable(4);

		expect(pager.heroHash(4)).toBe("photo-4");
	});

	it("forgets the grid rows of a Browse entry once reset to a profile opened elsewhere", () => {
		const pager = openPager({
			source: gridSource({ ids: range(1, 5) }),
			profileId: 3,
		});

		pager.reset({
			profileId: 4,
			ourProfileId: OUR_ID,
			origin: null,
			historyTraversal: false,
		});

		expect(pager.track).toEqual([4]);
		expect(pager.row(4)).toBeNull();
		expect(pager.heroHash(4)).toBeNull();
	});
});

describe("ProfilePagerState grid growth", () => {
	it("appends new grid profiles that follow the last profile still listed", () => {
		const source = gridSource({ ids: range(1, 5) });
		const pager = openPager({ source, profileId: 3 });

		source.profiles = [20, 1, 2, 3, 4, 6, OUR_ID, 2, 7].map(row);
		pager.absorbGridGrowth();

		expect(pager.track).toEqual([1, 2, 3, 4, 5, 6, 7]);
		expect(pager.row(6)).toEqual(row(6));
	});

	it("appends nothing once the grid was wiped", () => {
		const source = gridSource({ ids: range(1, 5) });
		const pager = openPager({ source, profileId: 3 });

		source.profiles = [];
		pager.absorbGridGrowth();
		source.profiles = [20, 21].map(row);
		pager.absorbGridGrowth();

		expect(pager.track).toEqual(range(1, 5));
	});

	it("mounts a profile appended next to an active profile at the end", () => {
		const source = gridSource({ ids: range(1, 5) });
		const pager = openPager({ source, profileId: 5 });
		expect(mountedPositions(pager)).toEqual([3, 4]);

		source.profiles = range(1, 7).map(row);
		pager.absorbGridGrowth();

		expect(mountedPositions(pager)).toEqual([3, 4, 5]);
		expect(fetchCount(6)).toBe(1);
	});

	it("shows no hero photo for an appended profile that was already unviewable", () => {
		markProfileUnviewable(6);
		const source = gridSource({ ids: range(1, 5) });
		const pager = openPager({ source, profileId: 3 });

		source.profiles = range(1, 6).map(row);
		pager.absorbGridGrowth();

		expect(pager.track).toEqual(range(1, 6));
		expect(pager.heroHash(6)).toBeNull();
		expect(pager.heroHash(5)).toBe("photo-5");
	});

	it("loads the next grid page once fewer than six profiles remain after the active one", () => {
		const source = gridSource({ ids: range(1, 20), nextPage: 1 });
		const pager = openPager({ source, profileId: 11 });

		pager.commit({ position: 13 });
		expect(source.loadMore).not.toHaveBeenCalled();

		pager.commit({ position: 14 });
		expect(source.loadMore).toHaveBeenCalledOnce();
	});

	it("loads the next grid page on an entry deep in the grid with fewer than six profiles after it", () => {
		const farEnough = gridSource({ ids: range(1, 120), nextPage: 1 });
		const nearEnd = gridSource({ ids: range(1, 120), nextPage: 1 });

		openPager({ source: farEnough, profileId: 114 });
		openPager({ source: nearEnd, profileId: 115 });

		expect(farEnough.loadMore).not.toHaveBeenCalled();
		expect(nearEnd.loadMore).toHaveBeenCalledOnce();
	});

	it("never loads more when the grid has no next page", () => {
		const source = gridSource({ ids: range(1, 20) });
		const pager = openPager({ source, profileId: 18 });

		pager.commit({ position: 19 });

		expect(source.loadMore).not.toHaveBeenCalled();
	});
});
