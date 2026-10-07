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

const CACHE_TTL_MS = 5_000;

function blockingList(blocked: { profileId: number }[]) {
	return {
		blocking: blocked.map(({ profileId }) => ({
			profileId,
			blockedTime: 0,
		})),
	};
}

function respondWithBlocking(blocked: { profileId: number }[]) {
	fetchRestMock.mockResolvedValue({
		jsonParsed: () => blockingList(blocked),
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

	it("does not join a blocking list request sent before the block", async () => {
		const request = pendingRequest(fetchRestMock);
		const before = getBlockedUsers();
		await blockUser({ profileId: PROFILE_ID });
		respondWithBlocking([{ profileId: PROFILE_ID }]);

		const after = await getBlockedUsers();
		request.succeed(blockingList([]));

		expect(await before).toEqual([]);
		expect(after).toEqual([{ profileId: PROFILE_ID, blockedTime: 0 }]);
		expect(fetchRestMock).toHaveBeenCalledTimes(3);
	});
});

describe("unblockUser", () => {
	let clock = 0;

	beforeEach(() => {
		clock = 1_000;
		setNowForTesting(() => clock);
	});

	it("makes the profile viewable again", async () => {
		await blockUser({ profileId: PROFILE_ID });
		await unblockUser({ profileId: PROFILE_ID });

		expect(isProfileViewable(PROFILE_ID)).toBe(true);
	});

	it("deletes the block and takes the profile out of the cached list", async () => {
		respondWithBlocking([{ profileId: PROFILE_ID }, { profileId: 8 }]);
		await getBlockedUsers();

		await unblockUser({ profileId: PROFILE_ID });

		expect(fetchRestMock).toHaveBeenNthCalledWith(
			2,
			`/v3/me/blocks/${PROFILE_ID}`,
			{ method: "DELETE" },
		);
		expect(await getBlockedUsers()).toEqual([
			{ profileId: 8, blockedTime: 0 },
		]);
		expect(fetchRestMock).toHaveBeenCalledTimes(2);
	});

	it("does not let a blocking list requested before the unblock hide the profile again", async () => {
		respondWithBlocking([{ profileId: PROFILE_ID }]);
		await markBlockedProfilesUnviewable();
		clock += CACHE_TTL_MS;
		const request = pendingRequest(fetchRestMock);
		const marking = markBlockedProfilesUnviewable();
		clock += 1;

		await unblockUser({ profileId: PROFILE_ID });
		clock += 1;
		request.succeed(blockingList([{ profileId: PROFILE_ID }]));
		await marking;

		expect(isProfileViewable(PROFILE_ID)).toBe(true);
	});

	it("leaves the profile out of a read that joins a request sent before the unblock", async () => {
		const request = pendingRequest(fetchRestMock);
		const before = getBlockedUsers();
		clock += 1;
		await unblockUser({ profileId: PROFILE_ID });
		clock += 1;

		const joined = getBlockedUsers();
		request.succeed(blockingList([{ profileId: PROFILE_ID }]));

		expect(await before).toEqual([]);
		expect(await joined).toEqual([]);
		expect(fetchRestMock).toHaveBeenCalledTimes(2);
	});

	it("leaves the profile out of a blocking list requested while the unblock was on its way", async () => {
		respondWithBlocking([{ profileId: PROFILE_ID }]);
		await markBlockedProfilesUnviewable();
		clock += CACHE_TTL_MS;
		const deletion = pendingRequest(fetchRestMock);
		const unblocking = unblockUser({ profileId: PROFILE_ID });
		clock += 1;
		const listRequest = pendingRequest(fetchRestMock);
		const marking = markBlockedProfilesUnviewable();
		const listing = getBlockedUsers();
		clock += 1;
		deletion.succeed();
		await unblocking;
		clock += 1;

		listRequest.succeed(
			blockingList([{ profileId: PROFILE_ID }, { profileId: 8 }]),
		);
		await marking;

		expect(await listing).toEqual([{ profileId: 8, blockedTime: 0 }]);
		expect(isProfileViewable(PROFILE_ID)).toBe(true);
		expect(fetchRestMock).toHaveBeenCalledTimes(3);
	});

	it("still counts a block made elsewhere after the unblock", async () => {
		await unblockUser({ profileId: PROFILE_ID });
		clock += 1;
		respondWithBlocking([{ profileId: PROFILE_ID }]);

		expect(await getBlockedUsers()).toEqual([
			{ profileId: PROFILE_ID, blockedTime: 0 },
		]);
	});

	it("keeps a profile unblocked and blocked again here in a list requested before both", async () => {
		const request = pendingRequest(fetchRestMock);
		const listing = getBlockedUsers();
		clock += 1;
		await unblockUser({ profileId: PROFILE_ID });
		clock += 1;
		await blockUser({ profileId: PROFILE_ID });

		request.succeed(blockingList([{ profileId: PROFILE_ID }]));

		expect(await listing).toEqual([
			{ profileId: PROFILE_ID, blockedTime: 0 },
		]);
	});

	it("forgets its unblocks for the next account", async () => {
		await unblockUser({ profileId: PROFILE_ID });
		clearAccountCaches();
		respondWithBlocking([{ profileId: PROFILE_ID }]);

		expect(await getBlockedUsers()).toEqual([
			{ profileId: PROFILE_ID, blockedTime: 0 },
		]);
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
