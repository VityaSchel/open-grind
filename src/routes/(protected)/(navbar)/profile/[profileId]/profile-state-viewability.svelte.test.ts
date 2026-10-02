import { beforeEach, describe, expect, it, vi } from "vitest";

const { getProfileMock, refreshProfileMock, isProfileCachedMock } = vi.hoisted(
	() => ({
		getProfileMock: vi.fn(),
		refreshProfileMock: vi.fn(),
		isProfileCachedMock: vi.fn<(profileId: number) => boolean>(),
	}),
);

vi.mock("$lib/api/error-toast", () => ({ showErrorToast: vi.fn() }));
vi.mock("$lib/api/users/favorites", () => ({
	getFavoriteNote: vi.fn(),
	invalidateFavoriteNote: vi.fn(),
}));
vi.mock("$lib/api/users/profiles", async (importOriginal) => ({
	...(await importOriginal<typeof import("$lib/api/users/profiles")>()),
	getProfile: getProfileMock,
	refreshProfile: refreshProfileMock,
	isProfileCached: isProfileCachedMock,
}));

import {
	BlockedProfileError,
	HiddenProfileError,
} from "$lib/api/users/profiles";
import type { Profile } from "$lib/model/users/profiles";
import { ProfileState } from "./profile-state.svelte";

const PROFILE_ID = 100001;
const OUR_ID = 42;

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function profile(): Profile {
	return {
		profileId: PROFILE_ID,
		displayName: "Peer",
		tapType: null,
		tapped: false,
		isFavorite: false,
	} as Profile;
}

function create() {
	return new ProfileState({ profileId: PROFILE_ID, ourProfileId: OUR_ID });
}

beforeEach(() => {
	vi.clearAllMocks();
	getProfileMock.mockResolvedValue(profile());
});

describe("ProfileState blocking", () => {
	it("shows the blocked screen without a refetch, and restores the profile on unblock", async () => {
		const state = create();
		await flush();
		getProfileMock.mockClear();

		state.markBlocked().settle();
		expect(state.error).toBeInstanceOf(BlockedProfileError);
		expect((state.error as BlockedProfileError).blockedByUs).toBe(true);

		state.markViewable().settle();
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

		state.markViewable().settle();
		await flush();

		expect(state.error).toBeNull();
		expect(state.profile).toEqual(profile());
	});
});

describe("ProfileState optimistic viewability changes", () => {
	it("brings the profile back without a refetch when a block is reverted", async () => {
		const state = create();
		await flush();

		state.markBlocked().revert();
		await flush();

		expect(state.error).toBeNull();
		expect(state.profile).toEqual(profile());
		expect(getProfileMock).toHaveBeenCalledOnce();
	});

	it("brings the profile back without a refetch when a hide is reverted", async () => {
		const state = create();
		await flush();

		const hiding = state.markHidden();
		expect(state.error).toBeInstanceOf(HiddenProfileError);
		hiding.revert();
		await flush();

		expect(state.error).toBeNull();
		expect(state.profile).toEqual(profile());
		expect(getProfileMock).toHaveBeenCalledOnce();
	});

	it("clears a server-side block at once and loads the profile only when the unblock settles", async () => {
		getProfileMock.mockRejectedValueOnce(
			new BlockedProfileError({ blockedByUs: true }),
		);
		const state = create();
		await flush();

		const unblocking = state.markViewable();
		await flush();
		expect(state.error).toBeNull();
		expect(state.profile).toBeNull();
		expect(getProfileMock).toHaveBeenCalledOnce();

		unblocking.settle();
		await flush();

		expect(getProfileMock).toHaveBeenCalledTimes(2);
		expect(state.profile).toEqual(profile());
	});

	it("puts the blocked screen back without a refetch when an unblock is reverted", async () => {
		const blocked = new BlockedProfileError({ blockedByUs: true });
		getProfileMock.mockRejectedValueOnce(blocked);
		const state = create();
		await flush();

		state.markViewable().revert();
		await flush();

		expect(state.error).toBe(blocked);
		expect(getProfileMock).toHaveBeenCalledOnce();
	});

	it("puts the hidden screen back over the profile when an unhide is reverted", async () => {
		const state = create();
		await flush();
		state.markHidden().settle();
		const hidden = state.error;

		const unhiding = state.markViewable();
		expect(state.error).toBeNull();
		unhiding.revert();

		expect(state.error).toBe(hidden);
		expect(state.profile).toEqual(profile());
	});

	it("reports a change as in flight until it settles or is reverted", async () => {
		const state = create();
		await flush();
		expect(state.changingViewability).toBe(false);

		const hiding = state.markHidden();
		expect(state.changingViewability).toBe(true);
		hiding.settle();
		expect(state.changingViewability).toBe(false);

		const unhiding = state.markViewable();
		expect(state.changingViewability).toBe(true);
		unhiding.revert();
		expect(state.changingViewability).toBe(false);
	});

	it("does not reload a profile whose unblock is still in flight", async () => {
		isProfileCachedMock.mockReturnValue(false);
		const state = create();
		await flush();
		state.markBlocked().settle();

		const unblocking = state.markViewable();
		state.revalidate();
		state.refresh();
		expect(refreshProfileMock).not.toHaveBeenCalled();

		unblocking.settle();
		refreshProfileMock.mockResolvedValueOnce(profile());
		state.revalidate();
		await flush();

		expect(refreshProfileMock).toHaveBeenCalledExactlyOnceWith(PROFILE_ID);
		expect(getProfileMock).toHaveBeenCalledOnce();
	});

	it("keeps the hidden screen when a refresh already in flight lands during the hide", async () => {
		isProfileCachedMock.mockReturnValue(false);
		const state = create();
		await flush();
		const refresh = Promise.withResolvers<Profile>();
		refreshProfileMock.mockReturnValueOnce(refresh.promise);
		state.revalidate();

		const hiding = state.markHidden();
		refresh.resolve(profile());
		await flush();
		expect(state.error).toBeInstanceOf(HiddenProfileError);

		hiding.settle();
		expect(state.error).toBeInstanceOf(HiddenProfileError);
		expect(state.refreshing).toBe(false);
	});

	it("keeps a block the server reported meanwhile when the hide is reverted", async () => {
		const state = create();
		await flush();
		const blocked = new BlockedProfileError({ blockedByUs: false });
		let failRefresh: (error: Error) => void = () => {};
		refreshProfileMock.mockReturnValueOnce(
			new Promise<Profile>((_, reject) => {
				failRefresh = reject;
			}),
		);
		state.refresh();

		const hiding = state.markHidden();
		failRefresh(blocked);
		await flush();
		hiding.revert();

		expect(state.error).toBe(blocked);
	});
});
