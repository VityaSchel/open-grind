import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { fetchRestMock } = vi.hoisted(() => ({ fetchRestMock: vi.fn() }));

vi.mock("$lib/api/transport", async (importOriginal) => ({
	...(await importOriginal<typeof import("$lib/api/transport")>()),
	fetchRest: fetchRestMock,
}));

import { clearAccountCaches } from "$lib/api/account-caches";
import {
	BlockDidNotStickError,
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
	beforeEach(() => {
		respondWithBlocking([{ profileId: PROFILE_ID }]);
	});

	it("marks the blocked profile as unviewable", async () => {
		await blockUser({ profileId: PROFILE_ID });

		expect(isProfileViewable(PROFILE_ID)).toBe(false);
	});

	it("confirms the block with a fresh read of the blocked list", async () => {
		await blockUser({ profileId: PROFILE_ID });

		expect(fetchRestMock).toHaveBeenNthCalledWith(
			1,
			`/v3/me/blocks/${PROFILE_ID}`,
			{ method: "POST" },
		);
		expect(fetchRestMock).toHaveBeenNthCalledWith(2, "/v3.1/me/blocks");
	});

	it("does not trust a blocked list cached before the block", async () => {
		respondWithBlocking([{ profileId: 8 }]);
		await getBlockedUsers();
		respondWithBlocking([{ profileId: PROFILE_ID }, { profileId: 8 }]);

		await blockUser({ profileId: PROFILE_ID });

		expect(isProfileViewable(PROFILE_ID)).toBe(false);
		expect(fetchRestMock).toHaveBeenCalledTimes(3);
	});

	it("fails and leaves the profile viewable when the blocked list does not include it", async () => {
		respondWithBlocking([{ profileId: 8 }]);

		await expect(blockUser({ profileId: PROFILE_ID })).rejects.toThrow(
			BlockDidNotStickError,
		);

		expect(isProfileViewable(PROFILE_ID)).toBe(true);
		expect(fetchRestMock).toHaveBeenCalledTimes(2);
	});

	it("leaves the lists alone until the blocked list confirms the block", async () => {
		const changes: ProfileViewabilityChange[] = [];
		const stopListening = onProfileViewabilityChange((change) =>
			changes.push(change),
		);
		const request = pendingRequest(fetchRestMock);
		const confirmation = pendingRequest(fetchRestMock);

		const blocking = blockUser({ profileId: PROFILE_ID });
		request.succeed();
		await vi.waitFor(() => expect(fetchRestMock).toHaveBeenCalledTimes(2));
		expect(changes).toEqual([]);
		expect(isProfileViewable(PROFILE_ID)).toBe(true);

		confirmation.succeed(blockingList([{ profileId: PROFILE_ID }]));
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

describe("blocking and unblocking right away", () => {
	const blockRequest = ([path, options]: unknown[]) =>
		path === `/v3/me/blocks/${PROFILE_ID}` &&
		(options as { method: string }).method === "POST";
	const unblockRequest = ([path, options]: unknown[]) =>
		path === `/v3/me/blocks/${PROFILE_ID}` &&
		(options as { method: string }).method === "DELETE";
	const listRequests = () =>
		fetchRestMock.mock.calls.filter(([path]) => path === "/v3.1/me/blocks");

	it("sends the unblock only after the block it undoes", async () => {
		const block = pendingRequest(fetchRestMock);
		const blocking = blockUser({ profileId: PROFILE_ID });
		const unblocking = unblockUser({ profileId: PROFILE_ID });
		await Promise.resolve();

		expect(fetchRestMock.mock.calls.some(unblockRequest)).toBe(false);
		block.succeed();
		await Promise.all([blocking, unblocking]);

		const order = fetchRestMock.mock.calls.flatMap((call) =>
			blockRequest(call)
				? ["block"]
				: unblockRequest(call)
					? ["unblock"]
					: [],
		);
		expect(order).toEqual(["block", "unblock"]);
	});

	it("does not check a block that was undone while it was on its way", async () => {
		respondWithBlocking([]);
		const block = pendingRequest(fetchRestMock);
		const blocking = blockUser({ profileId: PROFILE_ID });
		const unblocking = unblockUser({ profileId: PROFILE_ID });

		block.succeed();

		await expect(blocking).resolves.toBeUndefined();
		await unblocking;
		expect(listRequests()).toEqual([]);
		expect(isProfileViewable(PROFILE_ID)).toBe(true);
	});

	it("drops the check of a block undone while the blocked list loads", async () => {
		respondWithBlocking([]);
		const check = Promise.withResolvers<void>();
		fetchRestMock.mockImplementation((path: string) =>
			path === "/v3.1/me/blocks"
				? check.promise.then(() => ({
						jsonParsed: () => blockingList([]),
						assertOk: () => {},
					}))
				: Promise.resolve({
						jsonParsed: () => null,
						assertOk: () => {},
					}),
		);
		const blocking = blockUser({ profileId: PROFILE_ID });
		await vi.waitFor(() => expect(listRequests()).toHaveLength(1));

		await unblockUser({ profileId: PROFILE_ID });
		check.resolve();

		await expect(blocking).resolves.toBeUndefined();
		expect(isProfileViewable(PROFILE_ID)).toBe(true);
	});

	it("does not report a failed block that was already undone", async () => {
		const block = pendingRequest(fetchRestMock);
		const blocking = blockUser({ profileId: PROFILE_ID });
		const unblocking = unblockUser({ profileId: PROFILE_ID });

		block.fail();

		await expect(blocking).resolves.toBeUndefined();
		await unblocking;
	});

	it("drops the check of a block made before switching accounts", async () => {
		respondWithBlocking([]);
		const block = pendingRequest(fetchRestMock);
		const blocking = blockUser({ profileId: PROFILE_ID });

		clearAccountCaches();
		block.succeed();

		await expect(blocking).resolves.toBeUndefined();
		expect(listRequests()).toEqual([]);
	});
});

describe("unblockUser", () => {
	let clock = 0;

	beforeEach(() => {
		clock = 1_000;
		setNowForTesting(() => clock);
	});

	it("makes the profile viewable again", async () => {
		respondWithBlocking([{ profileId: PROFILE_ID }]);
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
		respondWithBlocking([{ profileId: PROFILE_ID }]);
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
