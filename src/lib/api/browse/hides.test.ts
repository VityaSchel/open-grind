import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { fetchRestMock } = vi.hoisted(() => ({ fetchRestMock: vi.fn() }));

vi.mock("$lib/api/transport", async (importOriginal) => ({
	...(await importOriginal<typeof import("$lib/api/transport")>()),
	fetchRest: fetchRestMock,
}));

import { clearAccountCaches } from "$lib/api/account-caches";
import {
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
import { resetNowForTesting, setNowForTesting } from "$lib/util/clock";

const hides = [{ profileId: 1 }, { profileId: 2 }];

const PROFILE_ID = 7;

let assertOk: ReturnType<typeof vi.fn>;

function pendingRequest() {
	const response = Promise.withResolvers<{ assertOk: () => void }>();
	fetchRestMock.mockReturnValueOnce(response.promise);
	return {
		succeed: () => response.resolve({ assertOk: () => {} }),
		fail: () =>
			response.resolve({
				assertOk: () => {
					throw new Error("API request failed with status 500");
				},
			}),
	};
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
		const request = pendingRequest();

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
		const request = pendingRequest();

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
		const request = pendingRequest();

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
		const request = pendingRequest();

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
