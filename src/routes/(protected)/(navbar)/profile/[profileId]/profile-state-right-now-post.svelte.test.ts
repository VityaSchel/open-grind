import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	getProfileMock,
	refreshProfileMock,
	getProfileRightNowPostMock,
	showErrorToastMock,
} = vi.hoisted(() => ({
	getProfileMock: vi.fn(),
	refreshProfileMock: vi.fn(),
	getProfileRightNowPostMock: vi.fn(),
	showErrorToastMock: vi.fn(),
}));

vi.mock("#lib/api/error-toast.ts", () => ({
	showErrorToast: showErrorToastMock,
}));
vi.mock("#lib/api/users/favorites.ts", () => ({
	getFavoriteNote: vi.fn(),
	invalidateFavoriteNote: vi.fn(),
}));
vi.mock("#lib/api/right-now/post.ts", () => ({
	getProfileRightNowPost: getProfileRightNowPostMock,
}));
vi.mock("#lib/api/users/profiles.ts", async (importOriginal) => ({
	...(await importOriginal<typeof import("#lib/api/users/profiles.ts")>()),
	getProfile: getProfileMock,
	refreshProfile: refreshProfileMock,
}));

import type { RightNowPostDetails } from "#lib/model/right-now/post.ts";
import type { Profile } from "#lib/model/users/profiles.ts";
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

function create({ fetched }: { fetched?: Profile } = {}) {
	return new ProfileState({
		profileId: PROFILE_ID,
		ourProfileId: OUR_ID,
		fetched: fetched && { profile: fetched, note: null },
	});
}

beforeEach(() => {
	vi.clearAllMocks();
	getProfileMock.mockResolvedValue(profile());
	getProfileRightNowPostMock.mockResolvedValue(null);
});

describe("ProfileState Right Now post", () => {
	const post = { id: 880_001, profileId: PROFILE_ID } as RightNowPostDetails;

	it("does not ask for the post of a profile that is not on Right Now", async () => {
		getProfileMock.mockResolvedValue(profile({ rightNow: "NOT_ACTIVE" }));
		const state = create();
		state.activate();
		await flush();

		expect(getProfileRightNowPostMock).not.toHaveBeenCalled();
		expect(state.rightNowPost).toBeNull();
	});

	it("waits until the profile is the active one before asking for its post", async () => {
		getProfileMock.mockResolvedValue(profile({ rightNow: "HOSTING" }));
		getProfileRightNowPostMock.mockResolvedValue(post);
		const state = create();
		await flush();

		expect(getProfileRightNowPostMock).not.toHaveBeenCalled();

		state.activate();
		await flush();

		expect(getProfileRightNowPostMock).toHaveBeenCalledExactlyOnceWith({
			profileId: PROFILE_ID,
		});
		expect(state.rightNowPost).toBe(post);
	});

	it("asks once when the profile becomes active again while its post is loading", async () => {
		getProfileMock.mockResolvedValue(profile({ rightNow: "HOSTING" }));
		getProfileRightNowPostMock.mockResolvedValue(post);
		const state = create();
		await flush();

		state.activate();
		state.deactivate();
		state.activate();
		await flush();

		expect(getProfileRightNowPostMock).toHaveBeenCalledOnce();
		expect(state.rightNowPost).toBe(post);
	});

	it("keeps the profile rendered when the post request fails", async () => {
		getProfileMock.mockResolvedValue(profile({ rightNow: "HOSTING" }));
		getProfileRightNowPostMock.mockRejectedValue(new Error("boom"));
		const state = create();
		state.activate();
		await flush();

		expect(getProfileRightNowPostMock).toHaveBeenCalledOnce();
		expect(state.profile?.profileId).toBe(PROFILE_ID);
		expect(state.error).toBeNull();
		expect(state.rightNowPost).toBeNull();
		expect(showErrorToastMock).not.toHaveBeenCalled();
	});

	it("asks for the post again on the next activation after the request failed", async () => {
		getProfileMock.mockResolvedValue(profile({ rightNow: "HOSTING" }));
		getProfileRightNowPostMock
			.mockResolvedValue(post)
			.mockRejectedValueOnce(new Error("boom"));
		const state = create();
		state.activate();
		await flush();

		state.deactivate();
		state.activate();
		await flush();

		expect(getProfileRightNowPostMock).toHaveBeenCalledTimes(2);
		expect(state.rightNowPost).toBe(post);
	});

	it("asks again on refresh and drops an answer the refresh overtook", async () => {
		getProfileMock.mockResolvedValue(profile({ rightNow: "NOT_HOSTING" }));
		refreshProfileMock.mockResolvedValue(
			profile({ rightNow: "NOT_HOSTING" }),
		);
		const stale = Promise.withResolvers<RightNowPostDetails | null>();
		getProfileRightNowPostMock
			.mockReturnValueOnce(stale.promise)
			.mockResolvedValueOnce(post);
		const state = create();
		state.activate();
		await flush();

		state.refresh();
		await flush();
		stale.resolve({ ...post, id: 1 });
		await flush();

		expect(getProfileRightNowPostMock).toHaveBeenCalledTimes(2);
		expect(state.rightNowPost).toBe(post);
	});

	it("asks once for the post of a profile fetched earlier once it becomes active", async () => {
		getProfileRightNowPostMock.mockResolvedValue(post);
		const state = create({ fetched: profile({ rightNow: "HOSTING" }) });

		state.activate();
		await flush();

		expect(getProfileRightNowPostMock).toHaveBeenCalledOnce();
		expect(state.rightNowPost).toBe(post);
	});

	it("asks once when the profile becomes active while a refresh is running", async () => {
		getProfileRightNowPostMock.mockResolvedValue(post);
		const refreshed = Promise.withResolvers<Profile>();
		refreshProfileMock.mockReturnValueOnce(refreshed.promise);
		const state = create({ fetched: profile({ rightNow: "NOT_ACTIVE" }) });

		state.refresh();
		state.activate();
		refreshed.resolve(profile({ rightNow: "HOSTING" }));
		await flush();

		expect(getProfileRightNowPostMock).toHaveBeenCalledOnce();
		expect(state.rightNowPost).toBe(post);
	});

	it("asks for the post when the profile became active during a refresh that failed", async () => {
		getProfileRightNowPostMock.mockResolvedValue(post);
		refreshProfileMock.mockRejectedValueOnce(new Error("offline"));
		const state = create({ fetched: profile({ rightNow: "HOSTING" }) });

		state.refresh();
		state.activate();
		await flush();

		expect(getProfileRightNowPostMock).toHaveBeenCalledExactlyOnceWith({
			profileId: PROFILE_ID,
		});
		expect(state.rightNowPost).toBe(post);
	});

	it("clears the post once a refresh shows the profile left Right Now", async () => {
		getProfileMock.mockResolvedValue(profile({ rightNow: "HOSTING" }));
		getProfileRightNowPostMock.mockResolvedValue(post);
		const state = create();
		state.activate();
		await flush();
		expect(state.rightNowPost).toBe(post);

		refreshProfileMock.mockResolvedValue(
			profile({ rightNow: "NOT_ACTIVE" }),
		);
		state.refresh();
		await flush();

		expect(state.rightNowPost).toBeNull();
		expect(getProfileRightNowPostMock).toHaveBeenCalledOnce();
	});
});
