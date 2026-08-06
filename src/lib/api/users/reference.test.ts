import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchRestMock } = vi.hoisted(() => ({ fetchRestMock: vi.fn() }));

vi.mock("$lib/api/transport", async (importOriginal) => ({
	...(await importOriginal<typeof import("$lib/api/transport")>()),
	fetchRest: fetchRestMock,
}));

import { clearAccountCaches } from "$lib/api/account-caches";
import { getGenders } from "$lib/api/users/genders";
import { getPronouns } from "$lib/api/users/pronouns";
import { getTags } from "$lib/api/users/tags";
import { gendersSchema } from "$lib/model/users/genders";

const reference = [
	{ path: "/public/v2/genders", get: getGenders },
	{ path: "/v1/pronouns", get: getPronouns },
	{ path: "/v1/tags", get: getTags },
];

beforeEach(() => {
	fetchRestMock.mockReset();
	fetchRestMock.mockResolvedValue({ jsonParsed: () => [] });
	clearAccountCaches();
});

describe.each(reference)("$path", ({ path, get }) => {
	it("is fetched once and then served from the cache", async () => {
		await get();
		await get();

		expect(fetchRestMock).toHaveBeenCalledExactlyOnceWith(path);
	});

	it("is refetched for the next account", async () => {
		await get();
		clearAccountCaches();
		await get();

		expect(fetchRestMock).toHaveBeenCalledTimes(2);
	});
});

describe("gender reference data", () => {
	it("accepts the nulls the official client accepts", () => {
		expect(
			gendersSchema.parse([
				{
					genderId: 1,
					gender: "Man",
					genderPlural: null,
					displayGroup: 1,
					sortProfile: null,
					sortFilter: null,
					excludeOnProfileSelection: null,
					excludeOnFilterSelection: null,
				},
			]),
		).toHaveLength(1);
	});

	it("accepts an entry with only the three keys the official client requires", () => {
		expect(
			gendersSchema.parse([
				{ genderId: 1, gender: "Man", displayGroup: 1 },
			]),
		).toHaveLength(1);
	});
});
