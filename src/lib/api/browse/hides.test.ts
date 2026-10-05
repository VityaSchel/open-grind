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
import { PROPAGATION_MS } from "$lib/api/browse/recently-lifted";
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

	function serverLists(profileIds: number[]): void {
		fetchRestMock.mockResolvedValue({
			jsonParsed: () => ({
				hides: profileIds.map((profileId) => ({ profileId })),
			}),
			assertOk,
		});
	}

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

	it("stops putting an unhidden profile first while the server still lists it", async () => {
		await hideAll([PROFILE_ID]);
		await unhideUser({ profileId: PROFILE_ID });

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

	it("keeps a just-hidden profile first through the server's read lag", async () => {
		await hideAll([PROFILE_ID]);
		clock += PROPAGATION_MS - 1;
		expect(await newestFirstWhenServerLists([2])).toEqual([2]);

		clock += CACHE_TTL_MS;

		expect(await newestFirstWhenServerLists([PROFILE_ID, 2])).toEqual([
			PROFILE_ID,
			2,
		]);
	});

	it("stops treating a profile as hidden here once the server goes without it past the propagation window", async () => {
		await hideAll([PROFILE_ID]);
		clock += PROPAGATION_MS;
		expect(await newestFirstWhenServerLists([2])).toEqual([2]);

		clock += CACHE_TTL_MS;

		expect(await newestFirstWhenServerLists([PROFILE_ID, 2])).toEqual([
			2,
			PROFILE_ID,
		]);
	});

	it("judges the read lag by when the list was requested, not when it is read again from the cache", async () => {
		await hideAll([PROFILE_ID]);
		clock += PROPAGATION_MS - CACHE_TTL_MS + 1;
		expect(await newestFirstWhenServerLists([2])).toEqual([2]);
		clock += CACHE_TTL_MS - 1;
		expect(await getHiddenUserIdsNewestFirst()).toEqual([2]);
		expect(fetchRestMock).toHaveBeenCalledTimes(2);

		clock += CACHE_TTL_MS;

		expect(await newestFirstWhenServerLists([PROFILE_ID, 2])).toEqual([
			PROFILE_ID,
			2,
		]);
	});

	it("keeps the request time of a cached list that unhides patched", async () => {
		await hideAll([PROFILE_ID]);
		clock += CACHE_TTL_MS;
		expect(await newestFirstWhenServerLists([2, 3, 5])).toEqual([5, 3, 2]);
		for (const profileId of [2, 3]) {
			clock += CACHE_TTL_MS - 1;
			await unhideUser({ profileId });
		}
		clock += CACHE_TTL_MS - 1;
		expect(await getHiddenUserIdsNewestFirst()).toEqual([5]);
		expect(fetchRestMock).toHaveBeenCalledTimes(4);

		clock += CACHE_TTL_MS;

		expect(await newestFirstWhenServerLists([PROFILE_ID, 5])).toEqual([
			PROFILE_ID,
			5,
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
});

describe("unhideUser", () => {
	it("deletes the hide and takes the profile out of the cached list", async () => {
		fetchRestMock.mockResolvedValue({
			jsonParsed: () => ({
				hides: [{ profileId: PROFILE_ID }, { profileId: 2 }],
			}),
			assertOk,
		});
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

	it("keeps a lagging server list from hiding the profile again", async () => {
		let clock = 1_000;
		setNowForTesting(() => clock);
		fetchRestMock.mockResolvedValue({
			jsonParsed: () => ({ hides: [{ profileId: PROFILE_ID }] }),
			assertOk,
		});
		await markHiddenProfilesUnviewable();

		await unhideUser({ profileId: PROFILE_ID });
		// past the list cache TTL, so the lagging server list is refetched
		clock += 6_000;
		await markHiddenProfilesUnviewable();

		expect(isProfileViewable(PROFILE_ID)).toBe(true);
	});

	it("checks the response status before dropping the cache", async () => {
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
