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
	ProfileModerationError,
	type ProfileUpdate,
	updateOwnProfile,
} from "$lib/api/users/profiles";
import type { Profile } from "$lib/model/profile";

const PROFILE_ID = 123;

function ok(data: unknown) {
	return {
		assertOk() {},
		json: () => data,
		jsonParsed: () => data,
	};
}

function update(patch: Partial<ProfileUpdate> = {}): ProfileUpdate {
	return {
		approximateDistance: false,
		profileTags: [],
		...patch,
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
			if (path === "/v3.1/me/profile" && method === "PUT") {
				return Promise.resolve(ok({}));
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

describe("updateOwnProfile", () => {
	it("uses the full-replace PUT endpoint", async () => {
		await updateOwnProfile(PROFILE_ID, update({ displayName: "Neo" }));

		expect(fetchRestMock).toHaveBeenCalledWith(
			"/v3.1/me/profile",
			expect.objectContaining({ method: "PUT" }),
		);
	});

	it("merges free-text fields the PATCH endpoint ignores into the cache", async () => {
		await getProfile(PROFILE_ID);

		await updateOwnProfile(
			PROFILE_ID,
			update({ displayName: "Neo", aboutMe: "the one" }),
		);

		const cached = await getProfile(PROFILE_ID);
		expect(cached.displayName).toBe("Neo");
		expect(cached.aboutMe).toBe("the one");
	});

	it("throws on banned terms and skips the cache merge", async () => {
		await getProfile(PROFILE_ID);
		fetchRestMock.mockImplementationOnce(() =>
			Promise.resolve(ok({ about_me: { terms: ["banned"] } })),
		);

		await expect(
			updateOwnProfile(PROFILE_ID, update({ aboutMe: "banned" })),
		).rejects.toBeInstanceOf(ProfileModerationError);

		expect((await getProfile(PROFILE_ID)).aboutMe).toBeUndefined();
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
