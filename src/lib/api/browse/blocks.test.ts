import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { fetchRestMock } = vi.hoisted(() => ({ fetchRestMock: vi.fn() }));

vi.mock("$lib/api/transport", async (importOriginal) => ({
	...(await importOriginal<typeof import("$lib/api/transport")>()),
	fetchRest: fetchRestMock,
}));

import { clearAccountCaches } from "$lib/api/account-caches";
import {
	blockUser,
	getBlockedUsers,
	markBlockedProfilesUnviewable,
	unblockUser,
} from "$lib/api/browse/blocks";
import { isProfileViewable } from "$lib/api/users/profile-viewability";
import { resetNowForTesting, setNowForTesting } from "$lib/util/clock";

const blocking = [{ profileId: 1, blockedTime: 0 }];

const PROFILE_ID = 7;

function respondWithBlocking(blocked: { profileId: number }[]) {
	fetchRestMock.mockResolvedValue({
		jsonParsed: () => ({
			blocking: blocked.map(({ profileId }) => ({
				profileId,
				blockedTime: 0,
			})),
		}),
		assertOk: () => {},
	});
}

beforeEach(() => {
	fetchRestMock.mockReset();
	fetchRestMock.mockResolvedValue({
		jsonParsed: () => ({ blocking }),
		assertOk: () => {},
	});
	clearAccountCaches();
});

afterEach(() => {
	resetNowForTesting();
});

describe("getBlockedUsers", () => {
	it("serves the blocking list from the cache for five seconds", async () => {
		let clock = 1_000;
		setNowForTesting(() => clock);

		expect(await getBlockedUsers()).toEqual(blocking);
		clock += 4_999;
		await getBlockedUsers();
		expect(fetchRestMock).toHaveBeenCalledExactlyOnceWith(
			"/v3.1/me/blocks",
		);

		clock += 1;
		await getBlockedUsers();
		expect(fetchRestMock).toHaveBeenCalledTimes(2);
	});

	it("is refetched for the next account", async () => {
		await getBlockedUsers();
		clearAccountCaches();
		await getBlockedUsers();

		expect(fetchRestMock).toHaveBeenCalledTimes(2);
	});
});

describe("blockUser", () => {
	it("marks the blocked profile as unviewable", async () => {
		await blockUser({ profileId: PROFILE_ID });

		expect(isProfileViewable(PROFILE_ID)).toBe(false);
	});

	it("leaves the profile viewable when the request fails", async () => {
		fetchRestMock.mockResolvedValueOnce({
			assertOk: () => {
				throw new Error("API request failed with status 500");
			},
		});

		await expect(blockUser({ profileId: PROFILE_ID })).rejects.toThrow(
			"status 500",
		);
		expect(isProfileViewable(PROFILE_ID)).toBe(true);
	});
});

describe("unblockUser", () => {
	it("makes the profile viewable again", async () => {
		await blockUser({ profileId: PROFILE_ID });
		await unblockUser({ profileId: PROFILE_ID });

		expect(isProfileViewable(PROFILE_ID)).toBe(true);
	});

	it("does not let a stale blocking list hide the profile again", async () => {
		let clock = 1_000;
		setNowForTesting(() => clock);
		respondWithBlocking([{ profileId: PROFILE_ID }]);
		await markBlockedProfilesUnviewable();

		await unblockUser({ profileId: PROFILE_ID });
		// past the list cache TTL, so the lagging server list is refetched
		clock += 6_000;
		await markBlockedProfilesUnviewable();

		expect(isProfileViewable(PROFILE_ID)).toBe(true);
	});
});

describe("markBlockedProfilesUnviewable", () => {
	it("marks everyone the server still lists as blocked", async () => {
		respondWithBlocking([{ profileId: PROFILE_ID }, { profileId: 8 }]);

		await markBlockedProfilesUnviewable();

		expect(isProfileViewable(PROFILE_ID)).toBe(false);
		expect(isProfileViewable(8)).toBe(false);
	});
});
