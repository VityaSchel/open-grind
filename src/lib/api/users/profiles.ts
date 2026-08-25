import z from "zod";

import { ApiError } from "$lib/api/api-error";
import { getBlockedUsers } from "$lib/api/browse/blocks";
import { getHiddenUsers } from "$lib/api/browse/hides";
import { FetchCache } from "$lib/api/cache";
import { fetchRest } from "$lib/api/transport";
import {
	ProfileModerationError,
	readBannedTerms,
} from "$lib/api/users/profile-moderation";
import {
	markProfileUnviewable,
	onProfileViewabilityChange,
} from "$lib/api/users/profile-viewability";
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

export class HiddenProfileError extends Error {
	constructor() {
		super("Hidden");
		this.name = "HiddenProfileError";
	}
}

export class ProfileUnavailableError extends Error {
	constructor() {
		super("Profile unavailable");
		this.name = "ProfileUnavailableError";
	}
}

export function isUnviewableProfileError(error: unknown): boolean {
	return (
		error instanceof BlockedProfileError ||
		error instanceof HiddenProfileError ||
		error instanceof ProfileUnavailableError
	);
}

const profileResponseSchema = z.object({
	profiles: z.array(profileSchema).length(1),
});

const MAGIC_PROFILE_UNAVAILABLE_DISPLAY_NAME = "3";
const MAGIC_PROFILE_BLOCK_DISPLAY_NAME = "4";

async function fetchProfile(profileId: number): Promise<Profile> {
	const [profile] = (
		await fetchRest(`/v7/profiles/${profileId}`, { method: "GET" }).then(
			(res) => res.jsonParsed(profileResponseSchema),
		)
	).profiles;
	if (!profile) throw new ProfileUnavailableError();
	if (isProbablyUnavailable(profile)) {
		if (profile.displayName === MAGIC_PROFILE_BLOCK_DISPLAY_NAME) {
			const blockedByUs = await getBlockedUsers().then((blocking) =>
				blocking.some((blocked) => blocked.profileId === profileId),
			);
			if (blockedByUs) throw new BlockedProfileError({ blockedByUs });
			const hiddenByUs = await getHiddenUsers().then((hides) =>
				hides.some((hidden) => hidden.profileId === profileId),
			);
			if (hiddenByUs) throw new HiddenProfileError();
			throw new BlockedProfileError({ blockedByUs });
		} else if (
			profile.displayName === MAGIC_PROFILE_UNAVAILABLE_DISPLAY_NAME
		) {
			throw new ProfileUnavailableError();
		}
	}
	return profile;
}

const profiles = new FetchCache(fetchProfile, { ttlMs: 60_000 });

export function getProfile(profileId: number): Promise<Profile> {
	return profiles.fetch(profileId).catch((error: unknown) => {
		if (isUnviewableProfileError(error)) markProfileUnviewable(profileId);
		throw error;
	});
}

const profileShortWithRightNowSchema = z.object({
	...profileShortSchema.shape,
	...profileRightNowSchema.shape,
	rightNowStatus: rightNowAttributionStatusSchema.nullish().catch("NONE"),
});

const getProfilesResponseSchema = z.object({
	profiles: z.array(profileShortWithRightNowSchema),
});

const GET_PROFILES_CHUNK_IDS = 30;

async function fetchProfilesBatch(
	targetProfileIds: number[],
): Promise<z.infer<typeof getProfilesResponseSchema>["profiles"]> {
	return await fetchRest("/v3/profiles", {
		method: "POST",
		body: { targetProfileIds },
	}).then((res) => res.jsonParsed(getProfilesResponseSchema).profiles);
}

export async function getProfiles(
	profileIds: number[],
): Promise<z.infer<typeof getProfilesResponseSchema>["profiles"]> {
	if (profileIds.length === 0) return [];
	const batches: number[][] = [];
	for (
		let start = 0;
		start < profileIds.length;
		start += GET_PROFILES_CHUNK_IDS
	)
		batches.push(profileIds.slice(start, start + GET_PROFILES_CHUNK_IDS));
	return (await Promise.all(batches.map(fetchProfilesBatch))).flat();
}

export function clearProfileCaches() {
	profiles.clear();
}

export function invalidateProfile(profileId: number) {
	profiles.delete(profileId);
}

onProfileViewabilityChange(({ profileId }) => invalidateProfile(profileId));

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

export function applyProfileEdit({
	base,
	patch,
}: {
	base: Profile;
	patch: Partial<Profile>;
}): Profile {
	const merged = { ...base, ...patch };
	if (patch.socialNetworks) {
		merged.socialNetworks = {
			...base.socialNetworks,
			...patch.socialNetworks,
		};
	}
	return merged;
}

export type ProfileEditListener = (edit: {
	profileId: number;
	patch: Partial<Profile>;
}) => void;

const profileEditListeners = new Set<ProfileEditListener>();

export function onProfileEdit(listener: ProfileEditListener): () => void {
	profileEditListeners.add(listener);
	return () => {
		profileEditListeners.delete(listener);
	};
}

export function mergeProfileEditIntoCaches({
	cacheProfileId,
	patch,
}: {
	cacheProfileId: number;
	patch: Partial<Profile>;
}) {
	profiles.update(cacheProfileId, (profile) =>
		applyProfileEdit({ base: profile, patch }),
	);
	for (const listener of profileEditListeners) {
		listener({ profileId: cacheProfileId, patch });
	}
}

export async function patchOwnProfile({
	cacheProfileId,
	patch,
}: {
	cacheProfileId: number;
	patch: ProfileEdit;
}) {
	const res = await fetchRest("/v4/me/profile", {
		method: "PATCH",
		body: patch,
	});
	res.assertOk();
	mergeProfileEditIntoCaches({ cacheProfileId, patch });
}

export async function updateOwnProfile({
	cacheProfileId,
	profile,
}: {
	cacheProfileId: number;
	profile: ProfileUpdate;
}) {
	const res = await fetchRest("/v3.1/me/profile", {
		method: "PUT",
		body: profile,
	});

	if (res.status === 200) {
		mergeProfileEditIntoCaches({ cacheProfileId, patch: profile });
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

export async function deleteProfilePhotos({
	cacheProfileId,
	mediaHashes,
}: {
	cacheProfileId: number;
	mediaHashes: string[];
}) {
	if (mediaHashes.length === 0) return;
	const res = await fetchRest("/v3/me/profile/images", {
		method: "DELETE",
		body: { media_hashes: mediaHashes },
	});
	res.assertOk();
	const cached = profiles.get(cacheProfileId);
	if (!cached) return;
	const removed = new Set(mediaHashes);
	mergeProfileEditIntoCaches({
		cacheProfileId,
		patch: {
			medias: cached.medias.filter((m) => !removed.has(m.mediaHash)),
		},
	});
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
