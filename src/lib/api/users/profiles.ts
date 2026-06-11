import z from "zod";

import { fetchRest } from "$lib/api";
import { getBlockedUsers } from "$lib/api/browse/blocks";
import { mediaHashPublicSchema } from "$lib/model/media";
import {
	genderSchema,
	type Profile,
	profileRightNowSchema,
	profileSchema,
	profileShortSchema,
	pronounSchema,
} from "$lib/model/profile";
import { profileTagsResponseSchema } from "$lib/model/tags";

function isProbablyBlocked(profile: Profile) {
	const nullFields = [
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
	];
	const falseFields = [
		"showAge",
		"showDistance",
		"approximateDistance",
		"isFavorite",
		"isNew",
		"tapped",
	];
	const emptyArrayFields = [
		"grindrTribes",
		"lookingFor",
		"medias",
		"hashtags",
		"profileTags",
		"meetAt",
	];
	const probablyBlocked =
		nullFields.every((field) => profile[field as keyof Profile] === null) &&
		falseFields.every((field) => profile[field as keyof Profile] === false) &&
		emptyArrayFields.every(
			(field) =>
				Array.isArray(profile[field as keyof Profile]) &&
				(profile[field as keyof Profile] as unknown[]).length === 0,
		) &&
		profile.vaccines &&
		profile.vaccines.length === 0 &&
		Object.keys(profile.socialNetworks).length === 0 &&
		profile.lastReceivedTapTimestamp === null;
	return probablyBlocked;
}

export class BlockedProfileError extends Error {
	blockedByUs: boolean;

	constructor({ blockedByUs }: { blockedByUs: boolean }) {
		super("Blocked");
		this.name = "BlockedProfileError";
		this.blockedByUs = blockedByUs;
	}
}

const profileResponseSchema = z.object({
	profiles: z.array(profileSchema).length(1),
});

const profilesCache = new Map<
	number,
	{ profile: Profile; updatedAt: number }
>();

export async function getProfile(profileId: number) {
	const cached = profilesCache.get(profileId);
	if (cached && Date.now() - cached.updatedAt < 1000 * 60) {
		return cached.profile;
	}
	const profile = (
		await fetchRest(`/v7/profiles/${profileId}`, {
			method: "GET",
		}).then((res) => res.jsonParsed(profileResponseSchema))
	).profiles[0];
	if (isProbablyBlocked(profile)) {
		const blockedByUs = await getBlockedUsers().then((blocking) =>
			blocking.some((blocked) => blocked.profileId === profileId),
		);
		throw new BlockedProfileError({ blockedByUs });
	}
	profilesCache.set(profileId, { profile, updatedAt: Date.now() });
	return profile;
}

const getProfilesResponseSchema = z.object({
	profiles: z.array(
		z.object({
			...profileShortSchema.shape,
			...profileRightNowSchema.shape,
		}),
	),
});

export async function getProfiles(
	profileIds: number[],
): Promise<z.infer<typeof getProfilesResponseSchema>["profiles"]> {
	if (profileIds.length === 0) return [];
	return await fetchRest("/v3/profiles", {
		method: "POST",
		body: {
			targetProfileIds: profileIds,
		},
	}).then((res) => res.jsonParsed(getProfilesResponseSchema).profiles);
}

let myProfileCache: {
	profile: z.infer<typeof getProfilesResponseSchema>["profiles"][0];
	updatedAt: number;
} | null = null;

export async function getMyProfile() {
	if (myProfileCache && Date.now() - myProfileCache.updatedAt < 1000 * 60) {
		return myProfileCache.profile;
	}
	const profile = await fetchRest("/v4/me/profile").then(
		(res) => res.jsonParsed(getProfilesResponseSchema).profiles[0],
	);
	myProfileCache = { profile, updatedAt: Date.now() };
	return profile;
}

export function clearProfileCaches() {
	myProfileCache = null;
	profilesCache.clear();
}

export type ProfileEdit = Partial<
	Pick<
		Profile,
		| "displayName"
		| "age"
		| "showAge"
		| "showDistance"
		| "aboutMe"
		| "ethnicity"
		| "relationshipStatus"
		| "bodyType"
		| "hivStatus"
		| "sexualPosition"
		| "nsfw"
		| "showTribes"
		| "showPosition"
		| "grindrTribes"
		| "tribesImInto"
		| "lookingFor"
		| "meetAt"
		| "vaccines"
		| "sexualHealth"
		| "genders"
		| "pronouns"
		| "lastTestedDate"
		| "socialNetworks"
		| "height"
		| "weight"
	>
>;

export function applyProfileEdit(base: Profile, patch: ProfileEdit): Profile {
	const merged = { ...base, ...patch };
	if (patch.socialNetworks) {
		merged.socialNetworks = { ...base.socialNetworks, ...patch.socialNetworks };
	}
	return merged;
}

function mergeProfileEditIntoCaches(
	cacheProfileId: number,
	patch: ProfileEdit,
) {
	const cached = profilesCache.get(cacheProfileId);
	if (cached) {
		profilesCache.set(cacheProfileId, {
			profile: applyProfileEdit(cached.profile, patch),
			updatedAt: Date.now(),
		});
	}
	if (myProfileCache && myProfileCache.profile.profileId === cacheProfileId) {
		const next: Record<string, unknown> = { ...myProfileCache.profile };
		for (const key of Object.keys(patch)) {
			if (key in next) next[key] = patch[key as keyof ProfileEdit];
		}
		myProfileCache = {
			profile: next as typeof myProfileCache.profile,
			updatedAt: Date.now(),
		};
	}
}

export async function patchOwnProfile(
	cacheProfileId: number,
	patch: ProfileEdit,
) {
	const res = await fetchRest("/v4/me/profile", {
		method: "PATCH",
		body: patch,
	});
	res.assertOk();
	mergeProfileEditIntoCaches(cacheProfileId, patch);
}

export async function deleteProfilePhotos(
	cacheProfileId: number,
	mediaHashes: string[],
) {
	if (mediaHashes.length === 0) return;
	const res = await fetchRest("/v3/me/profile/images", {
		method: "DELETE",
		body: { media_hashes: mediaHashes },
	});
	res.assertOk();
	const removed = new Set(mediaHashes);
	const cached = profilesCache.get(cacheProfileId);
	if (cached) {
		profilesCache.set(cacheProfileId, {
			profile: {
				...cached.profile,
				medias: cached.profile.medias.filter((m) => !removed.has(m.mediaHash)),
			},
			updatedAt: Date.now(),
		});
	}
	if (myProfileCache && myProfileCache.profile.profileId === cacheProfileId) {
		myProfileCache = {
			profile: {
				...myProfileCache.profile,
				medias: myProfileCache.profile.medias.filter(
					(m) => !removed.has(m.mediaHash),
				),
			},
			updatedAt: Date.now(),
		};
	}
}

const gendersResponseSchema = z.array(genderSchema);

export async function getGenders() {
	return await fetchRest("/public/v2/genders").then((res) =>
		res.jsonParsed(gendersResponseSchema),
	);
}

const pronounsResponseSchema = z.array(pronounSchema);

export async function getPronouns() {
	return await fetchRest("/v1/pronouns").then((res) =>
		res.jsonParsed(pronounsResponseSchema),
	);
}

export async function getProfileUploadedPhotos() {
	return await fetchRest("/v3.1/me/profile/images").then((res) =>
		res.jsonParsed(
			z.object({
				medias: z.array(
					z.object({
						mediaHash: mediaHashPublicSchema,
						type: z.number().int(),
						state: z.number().int(),
					}),
				),
			}),
		),
	);
}

export async function getProfileTags() {
	return await fetchRest("/v1/tags").then((res) =>
		res.jsonParsed(profileTagsResponseSchema),
	);
}
