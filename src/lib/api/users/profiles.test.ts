import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchRestMock } = vi.hoisted(() => ({ fetchRestMock: vi.fn() }));

vi.mock("$lib/api", async (importOriginal) => ({
	...(await importOriginal<typeof import("$lib/api")>()),
	fetchRest: fetchRestMock,
}));

import {
	applyProfileEdit,
	clearProfileCaches,
	deleteProfilePhotos,
	getMyProfile,
	getProfile,
	patchOwnProfile,
} from "$lib/api/users/profiles";
import type { Profile } from "$lib/model/profile";

const PROFILE_ID = 123;

function ok(data: unknown) {
	return {
		assertOk() {},
		jsonParsed: () => data,
	};
}

function fullProfile() {
	return {
		profileId: PROFILE_ID,
		age: 25,
		socialNetworks: {
			twitter: { userId: "tw" },
			facebook: { userId: "fb" },
		},
		medias: [{ mediaHash: "a" }, { mediaHash: "b" }],
	};
}

function shortProfile() {
	return {
		profileId: PROFILE_ID,
		showDistance: false,
		medias: [{ mediaHash: "a" }, { mediaHash: "b" }],
	};
}

beforeEach(() => {
	clearProfileCaches();
	fetchRestMock.mockReset();
	fetchRestMock.mockImplementation(
		(path: string, opts?: { method?: string }) => {
			const method = opts?.method ?? "GET";
			if (path.startsWith("/v7/profiles/")) {
				return Promise.resolve(ok({ profiles: [fullProfile()] }));
			}
			if (path === "/v4/me/profile" && method === "PATCH") {
				return Promise.resolve(ok(null));
			}
			if (path === "/v4/me/profile") {
				return Promise.resolve(ok({ profiles: [shortProfile()] }));
			}
			if (path === "/v3/me/profile/images") {
				return Promise.resolve(ok(null));
			}
			throw new Error(`unexpected request: ${method} ${path}`);
		},
	);
});

describe("applyProfileEdit", () => {
	it("deep-merges socialNetworks instead of replacing siblings", () => {
		const base = {
			age: 20,
			socialNetworks: {
				twitter: { userId: "tw" },
				facebook: { userId: "fb" },
			},
		} as unknown as Profile;

		const merged = applyProfileEdit(base, {
			age: 21,
			socialNetworks: { instagram: { userId: "ig" } },
		});

		expect(merged.age).toBe(21);
		expect(merged.socialNetworks).toEqual({
			twitter: { userId: "tw" },
			facebook: { userId: "fb" },
			instagram: { userId: "ig" },
		});
		expect(base.socialNetworks).toEqual({
			twitter: { userId: "tw" },
			facebook: { userId: "fb" },
		});
	});
});

describe("patchOwnProfile", () => {
	it("merges a partial socialNetworks patch into the cached profile", async () => {
		await getProfile(PROFILE_ID);

		await patchOwnProfile(PROFILE_ID, {
			socialNetworks: { instagram: { userId: "ig" } },
		});

		expect((await getProfile(PROFILE_ID)).socialNetworks).toEqual({
			twitter: { userId: "tw" },
			facebook: { userId: "fb" },
			instagram: { userId: "ig" },
		});
	});
});

describe("deleteProfilePhotos", () => {
	it("removes the hash from both the full and short profile caches", async () => {
		await getProfile(PROFILE_ID);
		await getMyProfile();

		await deleteProfilePhotos(PROFILE_ID, ["a"]);

		expect((await getProfile(PROFILE_ID)).medias).toEqual([{ mediaHash: "b" }]);
		expect((await getMyProfile()).medias).toEqual([{ mediaHash: "b" }]);
	});

	it("does not send a request when there are no hashes to remove", async () => {
		await deleteProfilePhotos(PROFILE_ID, []);

		expect(fetchRestMock).not.toHaveBeenCalled();
	});
});
