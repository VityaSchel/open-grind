import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
	getProfileMock,
	refreshProfileMock,
	isProfileCachedMock,
	getFavoriteNoteMock,
} = vi.hoisted(() => ({
	getProfileMock: vi.fn<(profileId: number) => Promise<Profile>>(),
	refreshProfileMock: vi.fn(),
	isProfileCachedMock: vi.fn<(profileId: number) => boolean>(),
	getFavoriteNoteMock: vi.fn(),
}));

vi.mock("$lib/api/error-toast", () => ({ showErrorToast: vi.fn() }));
vi.mock("$lib/api/users/favorites", () => ({
	getFavoriteNote: getFavoriteNoteMock,
	invalidateFavoriteNote: vi.fn(),
}));
vi.mock("$lib/api/users/profiles", async (importOriginal) => ({
	...(await importOriginal<typeof import("$lib/api/users/profiles")>()),
	getProfile: getProfileMock,
	refreshProfile: refreshProfileMock,
	isProfileCached: isProfileCachedMock,
}));
vi.mock("../record-visit", () => ({
	recordProfileVisit: vi.fn(() => Promise.resolve()),
	forgetProfileVisits: vi.fn(),
}));

import { clearAccountCaches } from "$lib/api/account-caches";
import {
	markProfileUnviewable,
	markProfileViewable,
} from "$lib/api/users/profile-viewability";
import type { Profile } from "$lib/model/users/profiles";
import { ProfileState } from "../profile-state.svelte";
import {
	destroyOpenedPagers,
	flush,
	gridSource,
	mountedPositions,
	openPager,
	OUR_ID,
	range,
	stateOf,
} from "./profile-pager-test-helpers";

const fetchCount = (profileId: number) =>
	getProfileMock.mock.calls.filter(([id]) => id === profileId).length;

beforeEach(() => {
	vi.restoreAllMocks();
	vi.clearAllMocks();
	clearAccountCaches();
	getProfileMock.mockImplementation((profileId: number) =>
		Promise.resolve({ profileId, isFavorite: false } as Profile),
	);
	isProfileCachedMock.mockReturnValue(true);
	getFavoriteNoteMock.mockResolvedValue({ notes: "", phoneNumber: "" });
});

afterEach(destroyOpenedPagers);

describe("ProfilePagerState mounted profiles", () => {
	it("mounts a full profile state for the entry and one profile on each side", () => {
		const pager = openPager({
			source: gridSource({ ids: range(1, 10) }),
			profileId: 6,
		});

		expect(mountedPositions(pager)).toEqual([4, 5, 6]);
		expect(pager.mounted.map(({ profileId }) => profileId)).toEqual([
			5, 6, 7,
		]);
		expect(pager.mounted.map(({ state }) => state.profileId)).toEqual([
			5, 6, 7,
		]);
		expect(
			getProfileMock.mock.calls
				.map(([id]) => id)
				.sort((left, right) => left - right),
		).toEqual([5, 6, 7]);
	});

	it("mounts the next-but-one profile once the pager leaves a stop, and drops the previous one only on arrival", () => {
		const destroy = vi.spyOn(ProfileState.prototype, "destroy");
		const pager = openPager({
			source: gridSource({ ids: range(1, 10) }),
			profileId: 6,
		});
		const behind = stateOf({ pager, profileId: 5 });

		pager.setVisiblePositions({ first: 5, last: 6 });

		expect(mountedPositions(pager)).toEqual([4, 5, 6, 7]);
		expect(getProfileMock).toHaveBeenCalledTimes(4);
		expect(fetchCount(8)).toBe(1);
		expect(destroy).not.toHaveBeenCalled();

		pager.setVisiblePositions({ first: 6, last: 6 });

		expect(mountedPositions(pager)).toEqual([5, 6, 7]);
		expect(destroy).toHaveBeenCalledOnce();
		expect(destroy.mock.contexts[0]).toBe(behind);
	});

	it("keeps the active profile mounted wherever the pager travels, and drops it once the pager lands elsewhere", () => {
		const destroy = vi.spyOn(ProfileState.prototype, "destroy");
		const pager = openPager({
			source: gridSource({ ids: range(1, 10) }),
			profileId: 3,
		});
		const departed = stateOf({ pager, profileId: 3 });

		pager.setVisiblePositions({ first: 9, last: 9 });

		expect(mountedPositions(pager)).toEqual([2, 8, 9]);
		expect(pager.activePosition).toBe(2);

		destroy.mockClear();
		pager.commit({ position: 9 });

		expect(mountedPositions(pager)).toEqual([8, 9]);
		expect(destroy).toHaveBeenCalledOnce();
		expect(destroy.mock.contexts[0]).toBe(departed);
	});

	it("remounts a profile fetched earlier without fetching it again", async () => {
		isProfileCachedMock.mockReturnValue(false);
		const pager = openPager({
			source: gridSource({ ids: range(1, 20) }),
			profileId: 6,
		});
		await flush();
		const fetched = stateOf({ pager, profileId: 5 })?.profile;

		pager.setVisiblePositions({ first: 10, last: 10 });
		expect(stateOf({ pager, profileId: 5 })).toBeUndefined();
		pager.setVisiblePositions({ first: 5, last: 5 });

		const remounted = stateOf({ pager, profileId: 5 });
		expect(remounted?.loading).toBe(false);
		expect(remounted?.profile).toBe(fetched);
		expect(fetchCount(5)).toBe(1);
		expect(fetchCount(7)).toBe(1);
	});

	it("lands again on a favorite fetched earlier without fetching its note again", async () => {
		getProfileMock.mockImplementation((profileId: number) =>
			Promise.resolve({
				profileId,
				isFavorite: profileId === 6,
			} as Profile),
		);
		const pager = openPager({
			source: gridSource({ ids: range(1, 20) }),
			profileId: 6,
		});
		await flush();
		pager.commit({ position: 6 });
		pager.setVisiblePositions({ first: 10, last: 10 });
		expect(stateOf({ pager, profileId: 6 })).toBeUndefined();

		pager.setVisiblePositions({ first: 5, last: 5 });
		pager.commit({ position: 5 });
		await flush();

		expect(stateOf({ pager, profileId: 6 })?.note).toEqual({
			notes: "",
			phoneNumber: "",
		});
		expect(getFavoriteNoteMock).toHaveBeenCalledExactlyOnceWith({
			profileId: 6,
		});
		expect(fetchCount(6)).toBe(1);
	});

	it("fetches a remounted profile again once its viewability changed", async () => {
		const pager = openPager({
			source: gridSource({ ids: range(1, 20) }),
			profileId: 6,
		});
		await flush();

		pager.setVisiblePositions({ first: 10, last: 10 });
		markProfileUnviewable(5);
		markProfileViewable(5);
		pager.setVisiblePositions({ first: 5, last: 5 });

		expect(fetchCount(5)).toBe(2);
		expect(fetchCount(7)).toBe(1);
	});

	it("fetches a remounted profile again when it turned unviewable while mounted", async () => {
		const pager = openPager({
			source: gridSource({ ids: range(1, 20) }),
			profileId: 6,
		});
		await flush();

		markProfileUnviewable(5);
		pager.setVisiblePositions({ first: 10, last: 10 });
		pager.setVisiblePositions({ first: 5, last: 5 });

		expect(stateOf({ pager, profileId: 5 })?.profile).toBeNull();
		expect(fetchCount(5)).toBe(2);
	});

	it("remounts a profile left while refreshing from the refreshed profile, not an older copy", async () => {
		const pager = openPager({
			source: gridSource({ ids: range(1, 20) }),
			profileId: 6,
		});
		await flush();
		pager.setVisiblePositions({ first: 10, last: 10 });
		pager.setVisiblePositions({ first: 6, last: 6 });
		let settleRefresh: (profile: Profile) => void = () => {};
		refreshProfileMock.mockImplementation(
			() =>
				new Promise<Profile>((resolve) => {
					settleRefresh = resolve;
				}),
		);
		isProfileCachedMock.mockReturnValue(false);
		pager.commit({ position: 6 });
		pager.setVisiblePositions({ first: 10, last: 10 });
		pager.commit({ position: 10 });

		const refreshed = {
			profileId: 7,
			isFavorite: false,
			displayName: "refreshed",
		} as Profile;
		settleRefresh(refreshed);
		getProfileMock.mockImplementation((profileId: number) =>
			Promise.resolve(
				profileId === 7
					? refreshed
					: ({ profileId, isFavorite: false } as Profile),
			),
		);
		isProfileCachedMock.mockReturnValue(true);
		await flush();
		pager.setVisiblePositions({ first: 6, last: 6 });
		pager.commit({ position: 6 });
		await flush();

		expect(stateOf({ pager, profileId: 7 })?.profile?.displayName).toBe(
			"refreshed",
		);
		expect(refreshProfileMock).toHaveBeenCalledOnce();
	});

	it("fetches every profile again after a reset", async () => {
		const source = gridSource({ ids: range(1, 20) });
		const pager = openPager({ source, profileId: 6 });
		await flush();
		pager.setVisiblePositions({ first: 10, last: 10 });

		pager.reset({
			profileId: 6,
			ourProfileId: OUR_ID,
			origin: "browse",
			historyTraversal: false,
		});

		expect(fetchCount(5)).toBe(2);
	});

	it("destroys every mounted state with the pager", () => {
		const destroy = vi.spyOn(ProfileState.prototype, "destroy");
		const pager = openPager({
			source: gridSource({ ids: range(1, 10) }),
			profileId: 6,
		});
		const states = pager.mounted.map(({ state }) => state);

		pager.destroy();

		expect(destroy).toHaveBeenCalledTimes(3);
		for (const state of states)
			expect(destroy.mock.contexts).toContain(state);
	});
});

describe("ProfilePagerState active profile", () => {
	it("lands on a mounted neighbor without a new state and revalidates it once", async () => {
		const pager = openPager({
			source: gridSource({ ids: range(1, 20) }),
			profileId: 6,
		});
		await flush();
		const neighbor = stateOf({ pager, profileId: 7 });
		isProfileCachedMock.mockReturnValue(false);
		refreshProfileMock.mockResolvedValue({ profileId: 7 });

		expect(pager.commit({ position: 6 })).toBe(7);

		expect(pager.activeId).toBe(7);
		expect(pager.activePosition).toBe(6);
		expect(stateOf({ pager, profileId: 7 })).toBe(neighbor);
		expect(fetchCount(7)).toBe(1);
		expect(refreshProfileMock).toHaveBeenCalledExactlyOnceWith(7);
	});

	it("fetches the favorite note of the active profile only", async () => {
		getProfileMock.mockImplementation((profileId: number) =>
			Promise.resolve({ profileId, isFavorite: true } as Profile),
		);
		const pager = openPager({
			source: gridSource({ ids: range(1, 10) }),
			profileId: 6,
		});
		await flush();

		expect(getFavoriteNoteMock.mock.calls).toEqual([[{ profileId: 6 }]]);

		pager.commit({ position: 6 });
		pager.setVisiblePositions({ first: 6, last: 6 });
		await flush();

		expect(getFavoriteNoteMock.mock.calls).toEqual([
			[{ profileId: 6 }],
			[{ profileId: 7 }],
		]);
	});

	it("does not fetch the note of a favorite the pager left before it loaded", async () => {
		let settleEntry: (profile: Profile) => void = () => {};
		getProfileMock.mockImplementation((profileId: number) =>
			profileId === 6
				? new Promise<Profile>((resolve) => {
						settleEntry = resolve;
					})
				: Promise.resolve({ profileId, isFavorite: false } as Profile),
		);
		const pager = openPager({
			source: gridSource({ ids: range(1, 10) }),
			profileId: 6,
		});

		pager.commit({ position: 6 });
		settleEntry({ profileId: 6, isFavorite: true } as Profile);
		await flush();

		expect(stateOf({ pager, profileId: 6 })?.profile?.isFavorite).toBe(
			true,
		);
		expect(getFavoriteNoteMock).not.toHaveBeenCalled();
	});
});
