import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { fetchRestMock } = vi.hoisted(() => ({ fetchRestMock: vi.fn() }));

vi.mock("$lib/api/transport", async (importOriginal) => ({
	...(await importOriginal<typeof import("$lib/api/transport")>()),
	fetchRest: fetchRestMock,
}));

import { clearAccountCaches } from "$lib/api/account-caches";
import {
	getHiddenUserIdsNewestFirst,
	getHiddenUsers,
	hideUser,
	markHiddenProfilesUnviewable,
	unhideUser,
} from "$lib/api/browse/hides";
import {
	isProfileViewable,
	onProfileViewabilityChange,
	type ProfileViewabilityChange,
} from "$lib/api/users/profile-viewability";
import { pendingRequest } from "$lib/test/pending-request";
import { resetNowForTesting, setNowForTesting } from "$lib/util/clock";

const hides = [{ profileId: 1 }, { profileId: 2 }];

const PROFILE_ID = 7;

const CACHE_TTL_MS = 5_000;

let assertOk: ReturnType<typeof vi.fn>;

function hiddenList(profileIds: number[]) {
	return { hides: profileIds.map((profileId) => ({ profileId })) };
}

function serverLists(profileIds: number[]): void {
	fetchRestMock.mockResolvedValue({
		jsonParsed: () => hiddenList(profileIds),
		assertOk,
	});
}

beforeEach(() => {
	fetchRestMock.mockReset();
	assertOk = vi.fn();
	fetchRestMock.mockResolvedValue({
		jsonParsed: () => ({ hides }),
		assertOk,
	});
	clearAccountCaches();
});

afterEach(() => {
	resetNowForTesting();
});

describe("getHiddenUsers", () => {
	it("serves the hidden list from the cache for five seconds", async () => {
		let clock = 1_000;
		setNowForTesting(() => clock);

		expect(await getHiddenUsers()).toEqual(hides);
		clock += 4_999;
		await getHiddenUsers();
		expect(fetchRestMock).toHaveBeenCalledExactlyOnceWith("/v1/hides");

		clock += 1;
		await getHiddenUsers();
		expect(fetchRestMock).toHaveBeenCalledTimes(2);
	});

	it("is refetched for the next account", async () => {
		await getHiddenUsers();
		clearAccountCaches();
		await getHiddenUsers();

		expect(fetchRestMock).toHaveBeenCalledTimes(2);
	});
});

describe("getHiddenUserIdsNewestFirst", () => {
	let clock = 0;

	beforeEach(() => {
		clock = 1_000;
		setNowForTesting(() => clock);
	});

	function newestFirstWhenServerLists(profileIds: number[]) {
		serverLists(profileIds);
		return getHiddenUserIdsNewestFirst();
	}

	async function hideAll(profileIds: number[]): Promise<void> {
		for (const profileId of profileIds) await hideUser({ profileId });
	}

	function permutations(items: number[]): number[][] {
		if (items.length <= 1) return [items];
		return items.flatMap((item, index) =>
			permutations(items.toSpliced(index, 1)).map((rest) => [
				item,
				...rest,
			]),
		);
	}

	it.each([[[1, 2, 3]], [[3, 2, 1]], [[2, 3, 1]]])(
		"puts this session's hides first, newest first, when the server lists %j",
		async (listed) => {
			await hideAll([1, 2, 3]);

			expect(await newestFirstWhenServerLists(listed)).toEqual([3, 2, 1]);
		},
	);

	it("follows them with profiles hidden elsewhere in reverse server order", async () => {
		await hideAll([5, 6]);

		expect(await newestFirstWhenServerLists([1, 6, 2, 5])).toEqual([
			6, 5, 2, 1,
		]);
	});

	it("only ever reorders the server's list", async () => {
		await hideAll([9, 2, 4]);

		for (const listed of permutations([1, 2, 3, 4])) {
			clock += CACHE_TTL_MS;

			expect(await newestFirstWhenServerLists(listed)).toEqual([
				4,
				2,
				...listed.toReversed().filter((id) => id !== 2 && id !== 4),
			]);
		}
	});

	it("leaves out a profile hidden here that the server does not list", async () => {
		await hideAll([PROFILE_ID]);

		expect(await newestFirstWhenServerLists([1, 2])).toEqual([2, 1]);
	});

	it("lists every profile once when the server repeats one", async () => {
		await hideAll([PROFILE_ID]);

		expect(
			await newestFirstWhenServerLists([1, 2, 1, PROFILE_ID, PROFILE_ID]),
		).toEqual([PROFILE_ID, 1, 2]);
	});

	it.each([[[1, 2]], [[2, 1]]])(
		"moves a profile hidden again to the front when the server lists %j",
		async (listed) => {
			await hideAll([1, 2, 1]);

			expect(await newestFirstWhenServerLists(listed)).toEqual([1, 2]);
		},
	);

	it("leaves out a profile unhidden here that a list requested before the unhide still has", async () => {
		await hideAll([PROFILE_ID]);
		const request = pendingRequest(fetchRestMock);
		const listing = getHiddenUserIdsNewestFirst();
		clock += 1;
		await unhideUser({ profileId: PROFILE_ID });
		clock += 1;

		request.succeed(hiddenList([PROFILE_ID, 2]));

		expect(await listing).toEqual([2]);
	});

	it("leaves out a profile unhidden here from the cached list without refetching", async () => {
		expect(await newestFirstWhenServerLists([PROFILE_ID, 2])).toEqual([
			2,
			PROFILE_ID,
		]);
		clock += 1;
		await unhideUser({ profileId: PROFILE_ID });

		expect(await getHiddenUserIdsNewestFirst()).toEqual([2]);
		expect(fetchRestMock).toHaveBeenCalledTimes(2);
	});

	it("does not put a profile unhidden here first when it is hidden again elsewhere", async () => {
		await hideAll([PROFILE_ID]);
		await unhideUser({ profileId: PROFILE_ID });
		clock += 1;

		expect(await newestFirstWhenServerLists([PROFILE_ID, 2])).toEqual([
			2,
			PROFILE_ID,
		]);
	});

	it("drops a profile unhidden on another device", async () => {
		await hideAll([PROFILE_ID, 2]);
		expect(await newestFirstWhenServerLists([PROFILE_ID, 2])).toEqual([
			2,
			PROFILE_ID,
		]);

		clock += CACHE_TTL_MS;

		expect(await newestFirstWhenServerLists([PROFILE_ID])).toEqual([
			PROFILE_ID,
		]);
	});

	it("keeps a profile hidden here first when a list requested before the hide arrives without it", async () => {
		const request = pendingRequest(fetchRestMock);
		const listing = getHiddenUserIdsNewestFirst();
		clock += 1;
		await hideAll([PROFILE_ID]);
		clock += 1;
		request.succeed(hiddenList([2]));
		expect(await listing).toEqual([2]);

		clock += 1;

		expect(await newestFirstWhenServerLists([PROFILE_ID, 2])).toEqual([
			PROFILE_ID,
			2,
		]);
	});

	it("stops treating a profile as hidden here once a list requested after the hide lacks it", async () => {
		await hideAll([PROFILE_ID]);
		clock += 1;
		expect(await newestFirstWhenServerLists([2])).toEqual([2]);

		clock += CACHE_TTL_MS;

		expect(await newestFirstWhenServerLists([PROFILE_ID, 2])).toEqual([
			2,
			PROFILE_ID,
		]);
	});

	it("does not let a list requested in the same millisecond as the hide forget it", async () => {
		await hideAll([PROFILE_ID]);
		expect(await newestFirstWhenServerLists([2])).toEqual([2]);

		clock += CACHE_TTL_MS;

		expect(await newestFirstWhenServerLists([PROFILE_ID, 2])).toEqual([
			PROFILE_ID,
			2,
		]);
	});

	it("forgets this session's hides for the next account", async () => {
		await hideAll([PROFILE_ID]);
		clearAccountCaches();

		expect(await newestFirstWhenServerLists([PROFILE_ID, 2])).toEqual([
			2,
			PROFILE_ID,
		]);
	});

	it("does not count a hide that lands after an account switch", async () => {
		const request = pendingRequest(fetchRestMock);
		const hiding = hideUser({ profileId: PROFILE_ID });
		clearAccountCaches();
		request.succeed();
		await hiding;

		expect(await newestFirstWhenServerLists([PROFILE_ID, 2])).toEqual([
			2,
			PROFILE_ID,
		]);
	});

	it("does not count a hide the server rejected", async () => {
		const request = pendingRequest(fetchRestMock);
		const hiding = hideUser({ profileId: PROFILE_ID });
		request.fail();
		await expect(hiding).rejects.toThrow("status 500");

		expect(await newestFirstWhenServerLists([PROFILE_ID, 2])).toEqual([
			2,
			PROFILE_ID,
		]);
	});
});

describe("hideUser", () => {
	it("posts the hide and drops the cached list", async () => {
		await getHiddenUsers();
		await hideUser({ profileId: PROFILE_ID });
		await getHiddenUsers();

		expect(fetchRestMock).toHaveBeenNthCalledWith(
			2,
			`/v1/me/hides/${PROFILE_ID}`,
			{ method: "POST" },
		);
		expect(fetchRestMock).toHaveBeenCalledTimes(3);
	});

	it("keeps the cached list until the server accepts the hide", async () => {
		await getHiddenUsers();
		const request = pendingRequest(fetchRestMock);

		const hiding = hideUser({ profileId: PROFILE_ID });
		await getHiddenUsers();
		expect(fetchRestMock).toHaveBeenCalledTimes(2);

		request.succeed();
		await hiding;
		await getHiddenUsers();
		expect(fetchRestMock).toHaveBeenCalledTimes(3);
	});

	it("keeps the cached list when the request fails", async () => {
		await getHiddenUsers();
		fetchRestMock.mockResolvedValueOnce({
			assertOk: () => {
				throw new Error("API request failed with status 500");
			},
		});

		await expect(hideUser({ profileId: PROFILE_ID })).rejects.toThrow(
			"status 500",
		);
		await getHiddenUsers();

		expect(fetchRestMock).toHaveBeenCalledTimes(2);
	});

	it("does not join a list request sent before the hide", async () => {
		const request = pendingRequest(fetchRestMock);
		const before = getHiddenUsers();
		await hideUser({ profileId: PROFILE_ID });
		serverLists([PROFILE_ID]);

		const after = await getHiddenUsers();
		request.succeed(hiddenList([]));

		expect(await before).toEqual([]);
		expect(after).toEqual([{ profileId: PROFILE_ID }]);
		expect(fetchRestMock).toHaveBeenCalledTimes(3);
	});
});

describe("unhideUser", () => {
	let clock = 0;

	beforeEach(() => {
		clock = 1_000;
		setNowForTesting(() => clock);
	});

	it("deletes the hide and takes the profile out of the cached list", async () => {
		serverLists([PROFILE_ID, 2]);
		await getHiddenUsers();

		await unhideUser({ profileId: PROFILE_ID });

		expect(fetchRestMock).toHaveBeenNthCalledWith(
			2,
			`/v1/hides/${PROFILE_ID}`,
			{ method: "DELETE" },
		);
		expect(await getHiddenUsers()).toEqual([{ profileId: 2 }]);
		expect(fetchRestMock).toHaveBeenCalledTimes(2);
	});

	it("does not let a list requested before the unhide hide the profile again", async () => {
		serverLists([PROFILE_ID]);
		await markHiddenProfilesUnviewable();
		clock += CACHE_TTL_MS;
		const request = pendingRequest(fetchRestMock);
		const marking = markHiddenProfilesUnviewable();
		clock += 1;

		await unhideUser({ profileId: PROFILE_ID });
		clock += 1;
		request.succeed(hiddenList([PROFILE_ID]));
		await marking;

		expect(isProfileViewable(PROFILE_ID)).toBe(true);
	});

	it("leaves the profile out of a read that joins a list request sent before the unhide", async () => {
		const request = pendingRequest(fetchRestMock);
		const before = getHiddenUsers();
		clock += 1;
		await unhideUser({ profileId: PROFILE_ID });
		clock += 1;

		const joined = getHiddenUsers();
		request.succeed(hiddenList([PROFILE_ID, 2]));

		expect(await before).toEqual([{ profileId: 2 }]);
		expect(await joined).toEqual([{ profileId: 2 }]);
		expect(fetchRestMock).toHaveBeenCalledTimes(2);
	});

	it("leaves the profile out of a list requested while the unhide was on its way", async () => {
		serverLists([PROFILE_ID]);
		await markHiddenProfilesUnviewable();
		clock += CACHE_TTL_MS;
		const deletion = pendingRequest(fetchRestMock);
		const unhiding = unhideUser({ profileId: PROFILE_ID });
		clock += 1;
		const listRequest = pendingRequest(fetchRestMock);
		const marking = markHiddenProfilesUnviewable();
		const listing = getHiddenUsers();
		clock += 1;
		deletion.succeed();
		await unhiding;
		clock += 1;

		listRequest.succeed(hiddenList([PROFILE_ID, 2]));
		await marking;

		expect(await listing).toEqual([{ profileId: 2 }]);
		expect(isProfileViewable(PROFILE_ID)).toBe(true);
		expect(fetchRestMock).toHaveBeenCalledTimes(3);
	});

	it("treats a list requested in the same millisecond as the unhide as older than it", async () => {
		const request = pendingRequest(fetchRestMock);
		const listing = getHiddenUsers();
		await unhideUser({ profileId: PROFILE_ID });

		request.succeed(hiddenList([PROFILE_ID]));

		expect(await listing).toEqual([]);
	});

	it("still counts a hide made elsewhere after the unhide", async () => {
		await unhideUser({ profileId: PROFILE_ID });
		clock += 1;
		serverLists([PROFILE_ID]);

		await markHiddenProfilesUnviewable();

		expect(isProfileViewable(PROFILE_ID)).toBe(false);
	});

	it("trusts a newer list that shows the profile hidden again elsewhere over an older one", async () => {
		const older = pendingRequest(fetchRestMock);
		const olderListing = getHiddenUsers();
		clock += 1;
		await unhideUser({ profileId: PROFILE_ID });
		clock += 1;
		await hideUser({ profileId: 2 });
		clock += 1;
		serverLists([PROFILE_ID, 2]);
		expect(await getHiddenUsers()).toEqual([
			{ profileId: PROFILE_ID },
			{ profileId: 2 },
		]);

		older.succeed(hiddenList([PROFILE_ID]));

		expect(await olderListing).toEqual([{ profileId: PROFILE_ID }]);
	});

	it("keeps a profile unhidden and hidden again here in a list requested before both", async () => {
		const request = pendingRequest(fetchRestMock);
		const listing = getHiddenUsers();
		clock += 1;
		await unhideUser({ profileId: PROFILE_ID });
		clock += 1;
		await hideUser({ profileId: PROFILE_ID });

		request.succeed(hiddenList([PROFILE_ID]));

		expect(await listing).toEqual([{ profileId: PROFILE_ID }]);
	});

	it("forgets its unhides for the next account", async () => {
		await unhideUser({ profileId: PROFILE_ID });
		clearAccountCaches();
		serverLists([PROFILE_ID]);

		expect(await getHiddenUsers()).toEqual([{ profileId: PROFILE_ID }]);
	});

	it("does not count an unhide that lands after an account switch", async () => {
		const request = pendingRequest(fetchRestMock);
		const unhiding = unhideUser({ profileId: PROFILE_ID });
		clearAccountCaches();
		request.succeed();
		await unhiding;
		serverLists([PROFILE_ID]);

		expect(await getHiddenUsers()).toEqual([{ profileId: PROFILE_ID }]);
	});

	it("checks the response status before taking the profile out", async () => {
		await unhideUser({ profileId: PROFILE_ID });

		expect(assertOk).toHaveBeenCalledOnce();
	});

	it("makes the profile viewable again", async () => {
		await hideUser({ profileId: PROFILE_ID });
		await unhideUser({ profileId: PROFILE_ID });

		expect(isProfileViewable(PROFILE_ID)).toBe(true);
	});
});

describe("hidden profiles and viewability", () => {
	it("takes the hidden profile out of the lists", async () => {
		await hideUser({ profileId: PROFILE_ID });

		expect(isProfileViewable(PROFILE_ID)).toBe(false);
	});

	it("leaves the lists alone until the server accepts the hide", async () => {
		const changes: ProfileViewabilityChange[] = [];
		const stopListening = onProfileViewabilityChange((change) =>
			changes.push(change),
		);
		const request = pendingRequest(fetchRestMock);

		const hiding = hideUser({ profileId: PROFILE_ID });
		expect(changes).toEqual([]);
		expect(isProfileViewable(PROFILE_ID)).toBe(true);

		request.succeed();
		await hiding;
		stopListening();
		expect(changes).toEqual([{ profileId: PROFILE_ID, viewable: false }]);
	});

	it("leaves the lists alone when the request fails", async () => {
		const changes: ProfileViewabilityChange[] = [];
		const stopListening = onProfileViewabilityChange((change) =>
			changes.push(change),
		);
		const request = pendingRequest(fetchRestMock);

		const hiding = hideUser({ profileId: PROFILE_ID });
		request.fail();

		await expect(hiding).rejects.toThrow("status 500");
		stopListening();
		expect(changes).toEqual([]);
		expect(isProfileViewable(PROFILE_ID)).toBe(true);
	});

	it("keeps an already unviewable profile unviewable when the request fails", async () => {
		fetchRestMock.mockResolvedValueOnce({
			jsonParsed: () => ({ hides: [{ profileId: PROFILE_ID }] }),
			assertOk,
		});
		await markHiddenProfilesUnviewable();
		const request = pendingRequest(fetchRestMock);

		const hiding = hideUser({ profileId: PROFILE_ID });
		request.fail();

		await expect(hiding).rejects.toThrow("status 500");
		expect(isProfileViewable(PROFILE_ID)).toBe(false);
	});

	it("marks everyone the server still lists as hidden", async () => {
		fetchRestMock.mockResolvedValue({
			jsonParsed: () => ({
				hides: [{ profileId: 11 }, { profileId: 12 }],
			}),
			assertOk,
		});

		await markHiddenProfilesUnviewable();

		expect(isProfileViewable(11)).toBe(false);
		expect(isProfileViewable(12)).toBe(false);
	});
});
