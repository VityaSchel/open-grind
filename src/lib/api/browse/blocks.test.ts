import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { fetchRestMock } = vi.hoisted(() => ({ fetchRestMock: vi.fn() }));

vi.mock("$lib/api", async (importOriginal) => ({
	...(await importOriginal<typeof import("$lib/api")>()),
	fetchRest: fetchRestMock,
}));

import { clearAccountCaches } from "$lib/api/account-caches";
import { getBlockedUsers } from "$lib/api/browse/blocks";
import { resetNowForTesting, setNowForTesting } from "$lib/util/clock";

const blocking = [{ profileId: 1, blockedTime: 0 }];

beforeEach(() => {
	fetchRestMock.mockReset();
	fetchRestMock.mockResolvedValue({ jsonParsed: () => ({ blocking }) });
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
		expect(fetchRestMock).toHaveBeenCalledExactlyOnceWith("/v3.1/me/blocks");

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
