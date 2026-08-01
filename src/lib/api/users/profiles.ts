import z from "zod";

import { fetchRest } from "$lib/api";
import { ApiError } from "$lib/api/api-error";
import { getBlockedUsers } from "$lib/api/browse/blocks";
import { FetchCache } from "$lib/api/cache";
import { mediaHashPublicSchema } from "$lib/model/media";
import { rightNowAttributionStatusSchema } from "$lib/model/right-now";
import {
	type Profile,
	profileRightNowSchema,
	profileSchema,
	profileShortSchema,
} from "$lib/model/users/profiles";

function isProbablyUnavailable(profile: Profile) {
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
	] as const satisfies readonly (keyof Profile)[];
	const falseFields = [
		"showAge",
		"showDistance",
		"approximateDistance",
		"isFavorite",
		"isNew",
		"tapped",
	] as const satisfies readonly (keyof Profile)[];
	const emptyArrayFields = [
		"grindrTribes",
		"lookingFor",
		"medias",
		"hashtags",
		"profileTags",
		"meetAt",
	] as const satisfies readonly (keyof Profile)[];
	const probablyBlocked =
		nullFields.every((field) => profile[field] === null) &&
		falseFields.every((field) => profile[field] === false) &&
		emptyArrayFields.every((field) => {
			const value = profile[field];
			return Array.isArray(value) && value.length === 0;
		}) &&
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

export class ProfileUnavailableError extends Error {
	constructor() {
		super("Profile unavailable");
		this.name = "ProfileUnavailableError";
	}
}

const profileResponseSchema = z.object({
	profiles: z.array(profileSchema).length(1),
});

const MAGIC_PROFILE_UNAVAILABLE_DISPLAY_NAME = "3";
const MAGIC_PROFILE_BLOCK_DISPLAY_NAME = "4";

async function fetchProfile(profileId: number): Promise<Profile> {
	const profile = (
		await fetchRest(`/v7/profiles/${profileId}`, {
			method: "GET",
		}).then((res) => res.jsonParsed(profileResponseSchema))
	).profiles[0];
	if (isProbablyUnavailable(profile)) {
		if (profile.displayName === MAGIC_PROFILE_BLOCK_DISPLAY_NAME) {
			const blockedByUs = await getBlockedUsers().then((blocking) =>
				blocking.some((blocked) => blocked.profileId === profileId),
			);
			throw new BlockedProfileError({ blockedByUs });
		} else if (profile.displayName === MAGIC_PROFILE_UNAVAILABLE_DISPLAY_NAME) {
			throw new ProfileUnavailableError();
		}
	}
	return profile;
}

const profiles = new FetchCache(fetchProfile, { ttlMs: 60_000 });

export function getProfile(profileId: number): Promise<Profile> {
	return profiles.fetch(profileId);
}

const profileShortWithRightNowSchema = z.object({
	...profileShortSchema.shape,
	...profileRightNowSchema.shape,
	rightNowStatus: rightNowAttributionStatusSchema.nullish().catch("NONE"),
});

const getProfilesResponseSchema = z.object({
	profiles: z.array(profileShortWithRightNowSchema),
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

export function clearProfileCaches() {
	profiles.clear();
}

export function invalidateProfile(profileId: number) {
	profiles.delete(profileId);
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

export type ProfileUpdate = ProfileEdit &
	Pick<Profile, "approximateDistance" | "profileTags">;

export function applyProfileEdit(
	base: Profile,
	patch: Partial<Profile>,
): Profile {
	const merged = { ...base, ...patch };
	if (patch.socialNetworks) {
		merged.socialNetworks = { ...base.socialNetworks, ...patch.socialNetworks };
	}
	return merged;
}

export function mergeProfileEditIntoCaches(
	cacheProfileId: number,
	patch: Partial<Profile>,
) {
	profiles.update(cacheProfileId, (profile) =>
		applyProfileEdit(profile, patch),
	);
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

const bannedTermsSchema = z
	.object({ terms: z.array(z.string()).nullish() })
	.nullish();

const bannedTermsErrorSchema = z.object({
	type: z.literal("urn:gr:err:hit_banned_terms"),
	display_name: bannedTermsSchema,
	about_me: bannedTermsSchema,
	gender_display: bannedTermsSchema,
	pronouns_display: bannedTermsSchema,
});

const moderatedFieldKeys = [
	"display_name",
	"about_me",
	"gender_display",
	"pronouns_display",
] as const;

const moderatedFieldLabels: Record<
	(typeof moderatedFieldKeys)[number],
	string
> = {
	display_name: "Display name",
	about_me: "About me",
	gender_display: "Gender",
	pronouns_display: "Pronouns",
};

export type ModeratedField = { field: string; terms: string[] };

export class ProfileModerationError extends Error {
	rejected: ModeratedField[];

	constructor(rejected: ModeratedField[]) {
		super(`Banned terms in: ${rejected.map((r) => r.field).join(", ")}`);
		this.name = "ProfileModerationError";
		this.rejected = rejected;
	}
}

function readBannedTerms(body: string): ModeratedField[] | null {
	let parsed: unknown;
	try {
		parsed = JSON.parse(body);
	} catch {
		return null;
	}
	const result = bannedTermsErrorSchema.safeParse(parsed);
	if (!result.success) return null;
	return moderatedFieldKeys
		.map((key) => ({
			field: moderatedFieldLabels[key],
			terms: result.data[key]?.terms ?? [],
		}))
		.filter((entry) => entry.terms.length > 0);
}

export async function updateOwnProfile(
	cacheProfileId: number,
	profile: ProfileUpdate,
) {
	const res = await fetchRest("/v3.1/me/profile", {
		method: "PUT",
		body: profile,
	});

	if (res.status === 200) {
		mergeProfileEditIntoCaches(cacheProfileId, profile);
		return;
	}

	const body = res.text();
	const rejected = readBannedTerms(body);
	if (rejected !== null) {
		throw new ProfileModerationError(rejected);
	}

	res.assertOk();
	throw new ApiError({
		message: `Unexpected ${res.status} response from profile update`,
		request: { method: "PUT", path: "/v3.1/me/profile", body: profile },
		response: { status: res.status, body },
	});
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
	profiles.update(cacheProfileId, (profile) => ({
		...profile,
		medias: profile.medias.filter((m) => !removed.has(m.mediaHash)),
	}));
}

export async function getProfileUploadedPhotos() {
	return await fetchRest("/v3.1/me/profile/images").then((res) =>
		res.jsonParsed(
			z.object({
				medias: z.array(
					z.object({
						mediaHash: mediaHashPublicSchema,
						type: z.int(),
						state: z.int(),
					}),
				),
			}),
		),
	);
}
