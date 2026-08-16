import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	getProfileMock,
	invalidateProfileMock,
	mergeProfileEditIntoCachesMock,
	recordProfileViewMock,
	getPreferencesMock,
	showErrorToastMock,
} = vi.hoisted(() => ({
	getProfileMock: vi.fn(),
	invalidateProfileMock: vi.fn(),
	mergeProfileEditIntoCachesMock: vi.fn(),
	recordProfileViewMock: vi.fn(() => Promise.resolve()),
	getPreferencesMock: vi.fn(),
	showErrorToastMock: vi.fn(),
}));

vi.mock("$lib/api/error-toast", () => ({ showErrorToast: showErrorToastMock }));
vi.mock("$lib/api/interest/views", () => ({
	recordProfileView: recordProfileViewMock,
}));
vi.mock("$lib/app-data/preferences.svelte", () => ({
	getPreferences: getPreferencesMock,
}));
vi.mock("$lib/api/users/profiles", async (importOriginal) => ({
	...(await importOriginal<typeof import("$lib/api/users/profiles")>()),
	getProfile: getProfileMock,
	invalidateProfile: invalidateProfileMock,
	mergeProfileEditIntoCaches: mergeProfileEditIntoCachesMock,
}));

import {
	BlockedProfileError,
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
	getPreferencesMock.mockResolvedValue({ revealProfileViews: false });
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

	it("reports a non-numeric profile id as unavailable without fetching", async () => {
		const state = create({ profileId: Number("nobody") });

		expect(state.error).toBeInstanceOf(ProfileUnavailableError);
		expect(state.loading).toBe(false);

		await flush();

		expect(getProfileMock).not.toHaveBeenCalled();
		expect(recordProfileViewMock).not.toHaveBeenCalled();
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
	it("drops the cached profile and replaces it with the fetched one", async () => {
		const state = create();
		await flush();

		getProfileMock.mockResolvedValueOnce(
			profile({ displayName: "renamed" }),
		);
		state.refresh();
		expect(state.refreshing).toBe(true);
		expect(state.profile).toEqual(profile());
		expect(invalidateProfileMock).toHaveBeenCalledExactlyOnceWith(
			PROFILE_ID,
		);
		await flush();

		expect(state.refreshing).toBe(false);
		expect(state.profile?.displayName).toBe("renamed");
	});

	it("keeps the profile on screen and toasts when a refresh fails", async () => {
		const state = create();
		await flush();

		getProfileMock.mockRejectedValueOnce(new Error("offline"));
		state.refresh();
		await flush();

		expect(showErrorToastMock).toHaveBeenCalledOnce();
		expect(state.profile).toEqual(profile());
		expect(state.error).toBeNull();
	});

	it("switches to the error screen when a refresh finds the profile blocked", async () => {
		const state = create();
		await flush();

		getProfileMock.mockRejectedValueOnce(
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

		getProfileMock.mockResolvedValueOnce(
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

		expect(invalidateProfileMock).not.toHaveBeenCalled();
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

describe("ProfileState view recording", () => {
	it("records a view when the preference is on", async () => {
		getPreferencesMock.mockResolvedValue({ revealProfileViews: true });
		create();
		await flush();

		expect(recordProfileViewMock).toHaveBeenCalledExactlyOnceWith({
			profileId: PROFILE_ID,
		});
	});

	it("records nothing when the preference is off", async () => {
		create();
		await flush();

		expect(recordProfileViewMock).not.toHaveBeenCalled();
	});

	it("records nothing on our own profile", async () => {
		getPreferencesMock.mockResolvedValue({ revealProfileViews: true });
		const state = create({ profileId: OUR_ID });
		await flush();

		expect(state.isOurProfile).toBe(true);
		expect(recordProfileViewMock).not.toHaveBeenCalled();
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
