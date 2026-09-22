import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	getProfileMock,
	refreshProfileMock,
	mergeProfileEditIntoCachesMock,
	getFavoriteNoteMock,
	invalidateFavoriteNoteMock,
	showErrorToastMock,
	isProfileCachedMock,
} = vi.hoisted(() => ({
	getProfileMock: vi.fn(),
	refreshProfileMock: vi.fn(),
	mergeProfileEditIntoCachesMock: vi.fn(),
	getFavoriteNoteMock: vi.fn(),
	invalidateFavoriteNoteMock: vi.fn(),
	showErrorToastMock: vi.fn(),
	isProfileCachedMock: vi.fn<(profileId: number) => boolean>(),
}));

vi.mock("$lib/api/error-toast", () => ({ showErrorToast: showErrorToastMock }));
vi.mock("$lib/api/users/favorites", () => ({
	getFavoriteNote: getFavoriteNoteMock,
	invalidateFavoriteNote: invalidateFavoriteNoteMock,
}));
vi.mock("$lib/api/users/profiles", async (importOriginal) => ({
	...(await importOriginal<typeof import("$lib/api/users/profiles")>()),
	getProfile: getProfileMock,
	refreshProfile: refreshProfileMock,
	mergeProfileEditIntoCaches: mergeProfileEditIntoCachesMock,
	isProfileCached: isProfileCachedMock,
}));

import {
	BlockedProfileError,
	HiddenProfileError,
	ProfileUnavailableError,
} from "$lib/api/users/profiles";
import { TapType } from "$lib/model/interest/taps";
import type { Profile } from "$lib/model/users/profiles";
import { ProfileState } from "./profile-state.svelte";

const PROFILE_ID = 100001;
const OUR_ID = 42;

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function profile(patch: Partial<Profile> = {}): Profile {
	return {
		profileId: PROFILE_ID,
		displayName: "Peer",
		tapType: null,
		tapped: false,
		isFavorite: false,
		...patch,
	} as Profile;
}

function create({ profileId = PROFILE_ID }: { profileId?: number } = {}) {
	return new ProfileState({ profileId, ourProfileId: OUR_ID });
}

function deferredProfile() {
	let settle: (value: Profile) => void = () => {};
	getProfileMock.mockReturnValueOnce(
		new Promise<Profile>((resolve) => {
			settle = resolve;
		}),
	);
	return (value: Profile) => settle(value);
}

beforeEach(() => {
	vi.clearAllMocks();
	getProfileMock.mockResolvedValue(profile());
	getFavoriteNoteMock.mockResolvedValue({ notes: "", phoneNumber: "" });
});

describe("ProfileState loading", () => {
	it("loads the profile on construction", async () => {
		const state = create();
		expect(state.loading).toBe(true);

		await flush();

		expect(getProfileMock).toHaveBeenCalledExactlyOnceWith(PROFILE_ID);
		expect(state.profile).toEqual(profile());
		expect(state.loading).toBe(false);
		expect(state.error).toBeNull();
	});

	it("starts from a profile fetched earlier without requesting it again", async () => {
		const fetched = profile({ displayName: "fetched earlier" });
		const state = new ProfileState({
			profileId: PROFILE_ID,
			ourProfileId: OUR_ID,
			fetched: { profile: fetched, note: null },
		});

		expect(state.loading).toBe(false);
		expect(state.profile).toEqual(fetched);

		await flush();

		expect(getProfileMock).not.toHaveBeenCalled();
	});

	it("fetches the note of a profile fetched earlier once it becomes active", async () => {
		const state = new ProfileState({
			profileId: PROFILE_ID,
			ourProfileId: OUR_ID,
			fetched: { profile: profile({ isFavorite: true }), note: null },
		});

		state.activate();
		await flush();

		expect(getFavoriteNoteMock).toHaveBeenCalledExactlyOnceWith({
			profileId: PROFILE_ID,
		});
		expect(getProfileMock).not.toHaveBeenCalled();
	});

	it("keeps a note fetched earlier without requesting it again", async () => {
		const note = { notes: "met at the bar", phoneNumber: "" };
		const state = new ProfileState({
			profileId: PROFILE_ID,
			ourProfileId: OUR_ID,
			fetched: { profile: profile({ isFavorite: true }), note },
		});

		state.activate();
		await flush();

		expect(state.note).toEqual(note);
		expect(getFavoriteNoteMock).not.toHaveBeenCalled();
	});

	it("reports a non-numeric profile id as unavailable without fetching", async () => {
		const state = create({ profileId: Number("nobody") });

		expect(state.error).toBeInstanceOf(ProfileUnavailableError);
		expect(state.loading).toBe(false);

		await flush();

		expect(getProfileMock).not.toHaveBeenCalled();
	});

	it("surfaces a failed first load and recovers on retry", async () => {
		getProfileMock.mockRejectedValueOnce(new Error("offline"));
		const state = create();
		await flush();

		expect(state.error).toEqual(new Error("offline"));
		expect(state.profile).toBeNull();
		expect(state.loading).toBe(false);

		state.retry();
		expect(state.loading).toBe(true);
		await flush();

		expect(state.error).toBeNull();
		expect(state.profile).toEqual(profile());
	});

	it("clears the screen before a hard reload", async () => {
		const state = create();
		await flush();

		const settle = deferredProfile();
		state.retry();

		expect(state.profile).toBeNull();
		expect(state.loading).toBe(true);

		settle(profile());
		await flush();
		expect(state.loading).toBe(false);
	});

	it("keeps the newer result when an older fetch settles last", async () => {
		const settleFirst = deferredProfile();
		const state = create();

		getProfileMock.mockResolvedValueOnce(
			profile({ displayName: "newest" }),
		);
		state.retry();
		await flush();

		settleFirst(profile({ displayName: "oldest" }));
		await flush();

		expect(state.profile?.displayName).toBe("newest");
	});

	it("ignores a fetch that settles after destroy", async () => {
		const settle = deferredProfile();
		const state = create();
		state.destroy();

		settle(profile());
		await flush();

		expect(state.profile).toBeNull();
	});
});

describe("ProfileState refresh", () => {
	it("refetches past the cache and replaces the profile on screen", async () => {
		const state = create();
		await flush();

		refreshProfileMock.mockResolvedValueOnce(
			profile({ displayName: "renamed" }),
		);
		state.refresh();
		expect(state.refreshing).toBe(true);
		expect(state.profile).toEqual(profile());
		expect(refreshProfileMock).toHaveBeenCalledExactlyOnceWith(PROFILE_ID);
		await flush();

		expect(state.refreshing).toBe(false);
		expect(state.profile?.displayName).toBe("renamed");
	});

	it("never evicts the cached profile before the refresh has succeeded", async () => {
		const state = create();
		await flush();

		refreshProfileMock.mockRejectedValueOnce(new Error("offline"));
		state.refresh();
		await flush();

		expect(state.profile).toEqual(profile());
		expect(state.error).toBeNull();
	});

	it("keeps the profile on screen and toasts when a refresh fails", async () => {
		const state = create();
		await flush();

		refreshProfileMock.mockRejectedValueOnce(new Error("offline"));
		state.refresh();
		await flush();

		expect(showErrorToastMock).toHaveBeenCalledOnce();
		expect(state.profile).toEqual(profile());
		expect(state.error).toBeNull();
	});

	it("switches to the error screen when a refresh finds the profile blocked", async () => {
		const state = create();
		await flush();

		refreshProfileMock.mockRejectedValueOnce(
			new BlockedProfileError({ blockedByUs: false }),
		);
		state.refresh();
		await flush();

		expect(state.error).toBeInstanceOf(BlockedProfileError);
		expect(state.profile).toBeNull();
		expect(showErrorToastMock).not.toHaveBeenCalled();
	});

	it("does not clear the loading flag of the load that superseded it", async () => {
		const state = create();
		await flush();

		refreshProfileMock.mockResolvedValueOnce(
			profile({ displayName: "refreshed" }),
		);
		const settleReload = deferredProfile();
		state.refresh();
		state.retry();
		await flush();

		expect(state.loading).toBe(true);
		expect(state.profile).toBeNull();

		settleReload(profile());
		await flush();
		expect(state.loading).toBe(false);
		expect(state.profile).toEqual(profile());
	});

	it("does nothing while a load is already in flight", async () => {
		const state = create();

		state.refresh();

		expect(refreshProfileMock).not.toHaveBeenCalled();
		expect(getProfileMock).toHaveBeenCalledOnce();
		await flush();
	});
});

describe("ProfileState blocking", () => {
	it("shows the blocked screen without a refetch, and restores the profile on unblock", async () => {
		const state = create();
		await flush();
		getProfileMock.mockClear();

		state.markBlocked();
		expect(state.error).toBeInstanceOf(BlockedProfileError);
		expect((state.error as BlockedProfileError).blockedByUs).toBe(true);

		state.markViewable();
		await flush();

		expect(state.error).toBeNull();
		expect(state.profile).toEqual(profile());
		expect(getProfileMock).not.toHaveBeenCalled();
	});

	it("refetches on unblock when the block came from the server", async () => {
		getProfileMock.mockRejectedValueOnce(
			new BlockedProfileError({ blockedByUs: true }),
		);
		const state = create();
		await flush();
		expect(state.profile).toBeNull();

		state.markViewable();
		await flush();

		expect(state.error).toBeNull();
		expect(state.profile).toEqual(profile());
	});
});

describe("ProfileState revalidation", () => {
	it("retries a transient error", async () => {
		getProfileMock.mockRejectedValueOnce(new Error("offline"));
		const state = create();
		await flush();

		state.revalidate();
		expect(state.loading).toBe(true);
		await flush();

		expect(getProfileMock).toHaveBeenCalledTimes(2);
		expect(state.error).toBeNull();
		expect(state.profile).toEqual(profile());
	});

	it("keeps a hidden profile hidden without refetching, however stale", async () => {
		isProfileCachedMock.mockReturnValue(false);
		const state = create();
		await flush();
		state.markHidden();

		state.revalidate();
		await flush();

		expect(getProfileMock).toHaveBeenCalledOnce();
		expect(refreshProfileMock).not.toHaveBeenCalled();
		expect(state.error).toBeInstanceOf(HiddenProfileError);
	});

	it("refreshes a just-shown profile once its cache entry has expired, without clearing it", async () => {
		isProfileCachedMock.mockImplementation((id) => id !== PROFILE_ID);
		const state = create();
		await flush();

		refreshProfileMock.mockResolvedValueOnce(
			profile({ displayName: "renamed" }),
		);
		state.revalidate();

		expect(state.refreshing).toBe(true);
		expect(state.profile).toEqual(profile());
		await flush();

		expect(refreshProfileMock).toHaveBeenCalledExactlyOnceWith(PROFILE_ID);
		expect(state.profile?.displayName).toBe("renamed");
	});

	it("leaves a profile alone while the cache still holds it", async () => {
		isProfileCachedMock.mockImplementation((id) => id === PROFILE_ID);
		const state = create();
		await flush();

		state.revalidate();
		await flush();

		expect(refreshProfileMock).not.toHaveBeenCalled();
		expect(getProfileMock).toHaveBeenCalledOnce();
	});

	it("does not start a reload while a request is in flight", async () => {
		getProfileMock.mockRejectedValueOnce(new Error("offline"));
		const state = create();
		await flush();
		refreshProfileMock.mockReturnValueOnce(new Promise(() => {}));
		state.refresh();

		state.revalidate();

		expect(getProfileMock).toHaveBeenCalledOnce();
		expect(state.error).toEqual(new Error("offline"));
	});
});

describe("ProfileState taps", () => {
	it("applies a tap to the profile and the profile cache", async () => {
		const state = create();
		await flush();

		state.setTap(TapType.Hot);

		expect(state.profile?.tapType).toBe(TapType.Hot);
		expect(state.profile?.tapped).toBe(true);
		expect(mergeProfileEditIntoCachesMock).toHaveBeenCalledExactlyOnceWith({
			cacheProfileId: PROFILE_ID,
			patch: { tapType: TapType.Hot, tapped: true },
		});
	});

	it("keeps a favorite on the profile and in the profile cache", async () => {
		const state = create();
		await flush();

		state.setFavorite(true);

		expect(state.profile?.isFavorite).toBe(true);
		expect(mergeProfileEditIntoCachesMock).toHaveBeenCalledExactlyOnceWith({
			cacheProfileId: PROFILE_ID,
			patch: { isFavorite: true },
		});
	});

	it("reverts a tap", async () => {
		const state = create();
		await flush();
		state.setTap(TapType.Hot);

		state.setTap(null);

		expect(state.profile?.tapType).toBeNull();
		expect(state.profile?.tapped).toBe(false);
		expect(mergeProfileEditIntoCachesMock).toHaveBeenLastCalledWith({
			cacheProfileId: PROFILE_ID,
			patch: { tapType: null, tapped: false },
		});
	});
});

describe("ProfileState favorite notes", () => {
	it("does not fetch a note for a profile that is not a favorite", async () => {
		create().activate();
		await flush();

		expect(getFavoriteNoteMock).not.toHaveBeenCalled();
	});

	it("fetches the note when the active profile is a favorite", async () => {
		getProfileMock.mockResolvedValue(profile({ isFavorite: true }));
		getFavoriteNoteMock.mockResolvedValue({
			notes: "met at the bar",
			phoneNumber: "555",
		});
		const state = create();
		state.activate();
		await flush();

		expect(getFavoriteNoteMock).toHaveBeenCalledExactlyOnceWith({
			profileId: PROFILE_ID,
		});
		expect(state.note).toEqual({
			notes: "met at the bar",
			phoneNumber: "555",
		});
	});

	it("does not fetch the note of a favorite that is not active", async () => {
		getProfileMock.mockResolvedValue(profile({ isFavorite: true }));
		const state = create();
		await flush();

		expect(state.profile?.isFavorite).toBe(true);
		expect(getFavoriteNoteMock).not.toHaveBeenCalled();
		expect(state.note).toBeNull();
	});

	it("fetches the note once when a loaded favorite becomes active", async () => {
		getProfileMock.mockResolvedValue(profile({ isFavorite: true }));
		const state = create();
		await flush();

		state.activate();
		state.activate();
		await flush();

		expect(getFavoriteNoteMock).toHaveBeenCalledExactlyOnceWith({
			profileId: PROFILE_ID,
		});
		expect(state.note).toEqual({ notes: "", phoneNumber: "" });
	});

	it("does not fetch the note of a favorite that loads after it stops being active", async () => {
		const settle = deferredProfile();
		const state = create();
		state.activate();
		state.deactivate();

		settle(profile({ isFavorite: true }));
		await flush();

		expect(state.profile?.isFavorite).toBe(true);
		expect(getFavoriteNoteMock).not.toHaveBeenCalled();
	});

	it("does not refetch a loaded note when the favorite becomes active again", async () => {
		getProfileMock.mockResolvedValue(profile({ isFavorite: true }));
		const state = create();
		state.activate();
		await flush();

		state.deactivate();
		state.activate();
		await flush();

		expect(getFavoriteNoteMock).toHaveBeenCalledOnce();
		expect(state.note).toEqual({ notes: "", phoneNumber: "" });
	});

	it("does not fetch a note when a deactivated profile becomes a favorite", async () => {
		const state = create();
		state.activate();
		await flush();
		state.deactivate();

		state.setFavorite(true);
		await flush();

		expect(state.profile?.isFavorite).toBe(true);
		expect(getFavoriteNoteMock).not.toHaveBeenCalled();
	});

	it("refetches the note with the profile only while active", async () => {
		getProfileMock.mockResolvedValue(profile({ isFavorite: true }));
		refreshProfileMock.mockResolvedValue(profile({ isFavorite: true }));
		const inactive = create();
		await flush();

		inactive.refresh();
		await flush();

		expect(refreshProfileMock).toHaveBeenCalledOnce();
		expect(getFavoriteNoteMock).not.toHaveBeenCalled();

		const active = create();
		active.activate();
		await flush();
		active.refresh();
		await flush();

		expect(getFavoriteNoteMock).toHaveBeenCalledTimes(2);
	});

	it("keeps the profile rendered when the note request fails", async () => {
		getProfileMock.mockResolvedValue(profile({ isFavorite: true }));
		getFavoriteNoteMock.mockRejectedValue(new Error("boom"));
		const state = create();
		state.activate();
		await flush();

		expect(getFavoriteNoteMock).toHaveBeenCalledOnce();
		expect(state.profile?.profileId).toBe(PROFILE_ID);
		expect(state.error).toBeNull();
		expect(state.note).toBeNull();
		expect(showErrorToastMock).not.toHaveBeenCalled();
	});

	it("drops the note when the profile stops being a favorite", async () => {
		getProfileMock.mockResolvedValue(profile({ isFavorite: true }));
		getFavoriteNoteMock.mockResolvedValue({
			notes: "keep",
			phoneNumber: "",
		});
		const state = create();
		state.activate();
		await flush();
		expect(state.note).not.toBeNull();

		state.setFavorite(false);

		expect(state.note).toBeNull();
	});

	it("fetches the note when the active profile becomes a favorite", async () => {
		const state = create();
		state.activate();
		await flush();

		state.setFavorite(true);
		await flush();

		expect(getFavoriteNoteMock).toHaveBeenCalledExactlyOnceWith({
			profileId: PROFILE_ID,
		});
	});

	it("does not fetch a note when an inactive profile becomes a favorite", async () => {
		const state = create();
		await flush();

		state.setFavorite(true);
		await flush();

		expect(state.profile?.isFavorite).toBe(true);
		expect(getFavoriteNoteMock).not.toHaveBeenCalled();
	});
});
