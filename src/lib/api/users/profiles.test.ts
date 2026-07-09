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
import type { Profile } from "$lib/model/users/profiles";

const PROFILE_ID = 123;

function ok(data: unknown) {
	return {
		status: 200,
		assertOk() {},
		json: () => data,
		jsonParsed: () => data,
		text: () => (data == null ? "" : JSON.stringify(data)),
	};
}

function okRaw(text: string, status = 200) {
	return {
		status,
		assertOk() {
			if (status < 200 || status >= 300) {
				throw new Error(`API request failed with status ${status}`);
			}
		},
		text: () => text,
	};
}

function httpError(status: number, body: unknown) {
	return {
		status,
		assertOk() {
			throw new Error(`API request failed with status ${status}`);
		},
		text: () => (typeof body === "string" ? body : JSON.stringify(body)),
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

	it("merges into the cache when the server answers with an empty body", async () => {
		await getProfile(PROFILE_ID);
		fetchRestMock.mockImplementationOnce(() => Promise.resolve(okRaw("")));

		await updateOwnProfile(PROFILE_ID, update({ displayName: "Trinity" }));

		expect((await getProfile(PROFILE_ID)).displayName).toBe("Trinity");
	});

	it("throws ProfileModerationError with the banned terms on a 400", async () => {
		await getProfile(PROFILE_ID);
		fetchRestMock.mockImplementationOnce(() =>
			Promise.resolve(
				httpError(400, {
					type: "urn:gr:err:hit_banned_terms",
					title: "Hit banned terms",
					status: 400,
					display_name: { terms: ["BANNED_TERM"] },
				}),
			),
		);

		const error = await updateOwnProfile(
			PROFILE_ID,
			update({ displayName: "BANNED_TERM" }),
		).catch((e: unknown) => e);

		expect(error).toBeInstanceOf(ProfileModerationError);
		expect((error as ProfileModerationError).rejected).toEqual([
			{ field: "Display name", terms: ["BANNED_TERM"] },
		]);
		expect((await getProfile(PROFILE_ID)).displayName).toBeUndefined();
	});

	it("hard-fails on a non-200 whose body is not a banned-terms error", async () => {
		await getProfile(PROFILE_ID);
		fetchRestMock.mockImplementationOnce(() =>
			Promise.resolve(httpError(400, { type: "urn:gr:err:something_else" })),
		);

		await expect(
			updateOwnProfile(PROFILE_ID, update({ displayName: "Neo" })),
		).rejects.toThrow("status 400");

		expect((await getProfile(PROFILE_ID)).displayName).toBeUndefined();
	});

	it("hard-fails on a non-200 with an unparseable body", async () => {
		fetchRestMock.mockImplementationOnce(() =>
			Promise.resolve(httpError(500, "<html>err</html>")),
		);

		await expect(
			updateOwnProfile(PROFILE_ID, update({ displayName: "Neo" })),
		).rejects.toThrow("status 500");
	});

	it("does not treat a non-200 success code as success", async () => {
		await getProfile(PROFILE_ID);
		fetchRestMock.mockImplementationOnce(() => Promise.resolve(okRaw("", 204)));

		await expect(
			updateOwnProfile(PROFILE_ID, update({ displayName: "Neo" })),
		).rejects.toBeInstanceOf(Error);

		expect((await getProfile(PROFILE_ID)).displayName).toBeUndefined();
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
