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
import {
	isProfileViewable,
	onProfileViewabilityChange,
	type ProfileViewabilityChange,
} from "$lib/api/users/profile-viewability";
import { pendingRequest } from "$lib/test/pending-request";
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

	it("leaves the lists alone until the server accepts the block", async () => {
		const changes: ProfileViewabilityChange[] = [];
		const stopListening = onProfileViewabilityChange((change) =>
			changes.push(change),
		);
		const request = pendingRequest(fetchRestMock);

		const blocking = blockUser({ profileId: PROFILE_ID });
		expect(changes).toEqual([]);
		expect(isProfileViewable(PROFILE_ID)).toBe(true);

		request.succeed();
		await blocking;
		stopListening();
		expect(changes).toEqual([{ profileId: PROFILE_ID, viewable: false }]);
	});

	it("leaves the lists alone when the request fails", async () => {
		const changes: ProfileViewabilityChange[] = [];
		const stopListening = onProfileViewabilityChange((change) =>
			changes.push(change),
		);
		const request = pendingRequest(fetchRestMock);

		const blocking = blockUser({ profileId: PROFILE_ID });
		request.fail();

		await expect(blocking).rejects.toThrow("status 500");
		stopListening();
		expect(changes).toEqual([]);
		expect(isProfileViewable(PROFILE_ID)).toBe(true);
	});

	it("keeps an already unviewable profile unviewable when the request fails", async () => {
		respondWithBlocking([{ profileId: PROFILE_ID }]);
		await markBlockedProfilesUnviewable();
		const request = pendingRequest(fetchRestMock);

		const blocking = blockUser({ profileId: PROFILE_ID });
		request.fail();

		await expect(blocking).rejects.toThrow("status 500");
		expect(isProfileViewable(PROFILE_ID)).toBe(false);
	});

	it("drops the cached blocking list once the server accepts the block", async () => {
		await getBlockedUsers();
		const request = pendingRequest(fetchRestMock);

		const blocking = blockUser({ profileId: PROFILE_ID });
		await getBlockedUsers();
		expect(fetchRestMock).toHaveBeenCalledTimes(2);

		request.succeed();
		await blocking;
		await getBlockedUsers();
		expect(fetchRestMock).toHaveBeenCalledTimes(3);
	});

	it("keeps the cached blocking list when the request fails", async () => {
		await getBlockedUsers();
		const request = pendingRequest(fetchRestMock);

		const blocking = blockUser({ profileId: PROFILE_ID });
		request.fail();

		await expect(blocking).rejects.toThrow("status 500");
		await getBlockedUsers();
		expect(fetchRestMock).toHaveBeenCalledTimes(2);
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
