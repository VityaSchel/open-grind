import z from "zod";

import { fetchRest } from "$lib/api";
import { getBlockedUsers } from "$lib/api/browse/blocks";
import { mediaHashPublicSchema } from "$lib/model/media";
import {
	type Profile,
	profileRightNowSchema,
	profileSchema,
	profileShortSchema,
} from "$lib/model/profile";

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
		}).then((res) => res.debugJsonParsed(profileResponseSchema))
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
