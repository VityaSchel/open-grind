import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import z from "zod";

const { fetchRestMock } = vi.hoisted(() => ({
	fetchRestMock:
		vi.fn<(path: string, options?: { method?: string }) => unknown>(),
}));

vi.mock("$lib/api/transport", async (importOriginal) => ({
	...(await importOriginal<typeof import("$lib/api/transport")>()),
	fetchRest: fetchRestMock,
}));

import { clearAccountCaches } from "$lib/api/account-caches";
import { ProfileModerationError } from "$lib/api/users/profile-moderation";
import {
	isProfileViewable,
	markProfileUnviewable,
} from "$lib/api/users/profile-viewability";
import {
	applyProfileEdit,
	BlockedProfileError,
	clearProfileCaches,
	deleteProfilePhotos,
	getProfile,
	HiddenProfileError,
	onProfileEdit,
	patchOwnProfile,
	ProfileUnavailableError,
	type ProfileUpdate,
	updateOwnProfile,
} from "$lib/api/users/profiles";
import { resetNowForTesting, setNowForTesting } from "$lib/util/clock";
import type { Profile } from "$lib/model/users/profiles";

const PROFILE_ID = 123;

function ok(data: unknown) {
	return {
		status: 200,
		assertOk() {},
		json: () => data,
		jsonParsed: () => data,
		text: () => (data ? JSON.stringify(data) : ""),
	};
}

function okValidated(data: unknown) {
	return {
		...ok(data),
		jsonParsed: (schema: z.ZodType) => schema.parse(data),
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
	return { approximateDistance: false, profileTags: [], ...patch };
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

function maskedProfile(displayName: string) {
	const emptied = Object.fromEntries(
		[
			"aboutMe",
			"age",
			"ethnicity",
			"relationshipStatus",
			"bodyType",
			"sexualPosition",
			"hivStatus",
			"lastTestedDate",
			"height",
			"weight",
			"seen",
			"onlineUntil",
			"distance",
			"profileImageMediaHash",
			"identity",
			"lastChatTimestamp",
			"lastViewed",
			"nsfw",
			"lastUpdatedTime",
			"genders",
			"pronouns",
			"tapType",
			"lastReceivedTapTimestamp",
		].map((field) => [field, null]),
	);
	return {
		...emptied,
		profileId: PROFILE_ID,
		displayName,
		showAge: false,
		showDistance: false,
		approximateDistance: false,
		isFavorite: false,
		isNew: false,
		tapped: false,
		grindrTribes: [],
		lookingFor: [],
		medias: [],
		hashtags: [],
		profileTags: [],
		meetAt: [],
		vaccines: [],
		socialNetworks: {},
	};
}

let blockedIds: { profileId: number }[] = [];
let hiddenIds: { profileId: number }[] = [];

beforeEach(() => {
	clearAccountCaches();
	clearProfileCaches();
	blockedIds = [];
	hiddenIds = [];
	fetchRestMock.mockReset();
	fetchRestMock.mockImplementation(
		(path: string, opts?: { method?: string }) => {
			const method = opts?.method ?? "GET";
			if (path.startsWith("/v7/profiles/")) {
				return Promise.resolve(ok({ profiles: [fullProfile()] }));
			}
			if (path === "/v3.1/me/blocks") {
				return Promise.resolve(ok({ blocking: blockedIds }));
			}
			if (path === "/v1/hides") {
				return Promise.resolve(ok({ hides: hiddenIds }));
			}
			if (path === "/v4/me/profile" && method === "PATCH") {
				return Promise.resolve(ok(null));
			}
			if (path === "/v3.1/me/profile" && method === "PUT") {
				return Promise.resolve(ok({}));
			}
			if (path === "/v3/me/profile/images") {
				return Promise.resolve(ok(null));
			}
			throw new Error(`unexpected request: ${method} ${path}`);
		},
	);
});

afterEach(() => {
	resetNowForTesting();
});

function countRequests(pathPrefix: string): number {
	return fetchRestMock.mock.calls.filter(([path]) =>
		path.startsWith(pathPrefix),
	).length;
}

describe("cache TTL", () => {
	it("serves getProfile from cache within the TTL and refetches after it", async () => {
		let clock = 1_000;
		setNowForTesting(() => clock);

		await getProfile(PROFILE_ID);
		await getProfile(PROFILE_ID);
		expect(countRequests("/v7/profiles/")).toBe(1);

		clock += 59_999;
		await getProfile(PROFILE_ID);
		expect(countRequests("/v7/profiles/")).toBe(1);

		clock += 1;
		await getProfile(PROFILE_ID);
		expect(countRequests("/v7/profiles/")).toBe(2);
	});
});

describe("getProfile", () => {
	function respondWith(profile: unknown) {
		fetchRestMock.mockImplementationOnce(() =>
			Promise.resolve(ok(profile)),
		);
	}

	it("marks a profile that blocked us as unviewable", async () => {
		respondWith({ profiles: [maskedProfile("4")] });

		const error = await getProfile(PROFILE_ID).catch((e: unknown) => e);

		expect(error).toBeInstanceOf(BlockedProfileError);
		expect((error as BlockedProfileError).blockedByUs).toBe(false);
		expect(isProfileViewable(PROFILE_ID)).toBe(false);
	});

	it("reports a profile we blocked as blocked by us", async () => {
		blockedIds = [{ profileId: PROFILE_ID }];
		respondWith({ profiles: [maskedProfile("4")] });

		const error = await getProfile(PROFILE_ID).catch((e: unknown) => e);

		expect(error).toBeInstanceOf(BlockedProfileError);
		expect((error as BlockedProfileError).blockedByUs).toBe(true);
	});

	it("tells a profile we hid apart from one that blocked us", async () => {
		hiddenIds = [{ profileId: PROFILE_ID }];
		respondWith({ profiles: [maskedProfile("4")] });

		const error = await getProfile(PROFILE_ID).catch((e: unknown) => e);

		expect(error).toBeInstanceOf(HiddenProfileError);
		expect(isProfileViewable(PROFILE_ID)).toBe(false);
	});

	it("prefers the block over the hide when we did both", async () => {
		blockedIds = [{ profileId: PROFILE_ID }];
		hiddenIds = [{ profileId: PROFILE_ID }];
		respondWith({ profiles: [maskedProfile("4")] });

		const error = await getProfile(PROFILE_ID).catch((e: unknown) => e);

		expect(error).toBeInstanceOf(BlockedProfileError);
	});

	it("marks an unavailable profile as unviewable", async () => {
		respondWith({ profiles: [maskedProfile("3")] });

		const error = await getProfile(PROFILE_ID).catch((e: unknown) => e);

		expect(error).toBeInstanceOf(ProfileUnavailableError);
		expect(isProfileViewable(PROFILE_ID)).toBe(false);
	});

	it("keeps a profile viewable when the request itself fails", async () => {
		fetchRestMock.mockImplementationOnce(() =>
			Promise.reject(new Error("offline")),
		);

		await expect(getProfile(PROFILE_ID)).rejects.toThrow("offline");
		expect(isProfileViewable(PROFILE_ID)).toBe(true);
	});

	it("drops the cached profile once it becomes unviewable", async () => {
		await getProfile(PROFILE_ID);

		markProfileUnviewable(PROFILE_ID);
		await getProfile(PROFILE_ID);

		expect(countRequests("/v7/profiles/")).toBe(2);
	});

	it("rejects an empty profiles array instead of caching undefined", async () => {
		fetchRestMock.mockImplementationOnce(() =>
			Promise.resolve(okValidated({ profiles: [] })),
		);

		const error = await getProfile(PROFILE_ID).catch((e: unknown) => e);

		expect(error).toBeInstanceOf(z.ZodError);
		expect((error as z.ZodError).issues[0]?.code).toBe("too_small");

		expect(await getProfile(PROFILE_ID)).toEqual(fullProfile());
		expect(countRequests("/v7/profiles/")).toBe(2);
	});
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

		const merged = applyProfileEdit({
			base,
			patch: { age: 21, socialNetworks: { instagram: { userId: "ig" } } },
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

		await patchOwnProfile({
			cacheProfileId: PROFILE_ID,
			patch: { socialNetworks: { instagram: { userId: "ig" } } },
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
		await updateOwnProfile({
			cacheProfileId: PROFILE_ID,
			profile: update({ displayName: "Neo" }),
		});

		expect(fetchRestMock).toHaveBeenCalledWith(
			"/v3.1/me/profile",
			expect.objectContaining({ method: "PUT" }),
		);
	});

	it("merges free-text fields the PATCH endpoint ignores into the cache", async () => {
		await getProfile(PROFILE_ID);

		await updateOwnProfile({
			cacheProfileId: PROFILE_ID,
			profile: update({ displayName: "Neo", aboutMe: "the one" }),
		});

		const cached = await getProfile(PROFILE_ID);
		expect(cached.displayName).toBe("Neo");
		expect(cached.aboutMe).toBe("the one");
	});

	it("merges a moderated edit made after the cache entry expired", async () => {
		let clock = 1_000;
		setNowForTesting(() => clock);
		await getProfile(PROFILE_ID);

		clock += 60_000;
		await updateOwnProfile({
			cacheProfileId: PROFILE_ID,
			profile: update({ displayName: "Neo" }),
		});

		expect((await getProfile(PROFILE_ID)).displayName).toBe("Neo");
		expect(countRequests("/v7/profiles/")).toBe(1);
	});

	it("merges into the cache when the server answers with an empty body", async () => {
		await getProfile(PROFILE_ID);
		fetchRestMock.mockImplementationOnce(() => Promise.resolve(okRaw("")));

		await updateOwnProfile({
			cacheProfileId: PROFILE_ID,
			profile: update({ displayName: "Trinity" }),
		});

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

		const error = await updateOwnProfile({
			cacheProfileId: PROFILE_ID,
			profile: update({ displayName: "BANNED_TERM" }),
		}).catch((e: unknown) => e);

		expect(error).toBeInstanceOf(ProfileModerationError);
		expect((error as ProfileModerationError).rejected).toEqual([
			{ field: "Display name", terms: ["BANNED_TERM"] },
		]);
		expect((await getProfile(PROFILE_ID)).displayName).toBeUndefined();
	});

	it("hard-fails on a non-200 whose body is not a banned-terms error", async () => {
		await getProfile(PROFILE_ID);
		fetchRestMock.mockImplementationOnce(() =>
			Promise.resolve(
				httpError(400, { type: "urn:gr:err:something_else" }),
			),
		);

		await expect(
			updateOwnProfile({
				cacheProfileId: PROFILE_ID,
				profile: update({ displayName: "Neo" }),
			}),
		).rejects.toThrow("status 400");

		expect((await getProfile(PROFILE_ID)).displayName).toBeUndefined();
	});

	it("hard-fails on a non-200 with an unparseable body", async () => {
		fetchRestMock.mockImplementationOnce(() =>
			Promise.resolve(httpError(500, "<html>err</html>")),
		);

		await expect(
			updateOwnProfile({
				cacheProfileId: PROFILE_ID,
				profile: update({ displayName: "Neo" }),
			}),
		).rejects.toThrow("status 500");
	});

	it("does not treat a non-200 success code as success", async () => {
		await getProfile(PROFILE_ID);
		fetchRestMock.mockImplementationOnce(() =>
			Promise.resolve(okRaw("", 204)),
		);

		await expect(
			updateOwnProfile({
				cacheProfileId: PROFILE_ID,
				profile: update({ displayName: "Neo" }),
			}),
		).rejects.toBeInstanceOf(Error);

		expect((await getProfile(PROFILE_ID)).displayName).toBeUndefined();
	});
});

describe("deleteProfilePhotos", () => {
	it("removes the hash from the cached profile", async () => {
		await getProfile(PROFILE_ID);

		await deleteProfilePhotos({
			cacheProfileId: PROFILE_ID,
			mediaHashes: ["a"],
		});

		expect((await getProfile(PROFILE_ID)).medias).toEqual([
			{ mediaHash: "b" },
		]);
	});

	it("reports the removal to the profile edit listeners", async () => {
		await getProfile(PROFILE_ID);
		const edits: { profileId: number; patch: Partial<Profile> }[] = [];
		const unsubscribe = onProfileEdit((edit) => edits.push(edit));

		await deleteProfilePhotos({
			cacheProfileId: PROFILE_ID,
			mediaHashes: ["a"],
		});
		unsubscribe();

		expect(edits).toEqual([
			{ profileId: PROFILE_ID, patch: { medias: [{ mediaHash: "b" }] } },
		]);
	});

	it("does not send a request when there are no hashes to remove", async () => {
		await deleteProfilePhotos({
			cacheProfileId: PROFILE_ID,
			mediaHashes: [],
		});

		expect(fetchRestMock).not.toHaveBeenCalled();
	});
});
