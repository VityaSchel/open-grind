import type z from "zod";

import type {
	cascadeV4ResponseFullProfileV1Schema,
	cascadeV4ResponsePartialProfileV1Schema,
} from "$lib/model/browse/grid/cascade/response/v4";
import type {
	Profile,
	profileRightNowSchema,
	profileShortSchema,
} from "$lib/model/users/profiles";
import {
	DAY,
	DEMO_ID_START,
	DEMO_PROFILE_COUNT,
	demoMeProfileId,
	GRID_PAGE_SIZE,
	MINUTE,
	NOW,
} from "../config";
import { demoFavoriteOf } from "./favorites";
import {
	type DemoSeed,
	distanceForId,
	lastOnlineOf,
	mediasOf,
	onlineUntilOf,
	photosOf,
	profileSeed,
	socialNetworksOf,
} from "./profiles";

export function num(value: string | null): number | undefined {
	if (value === null) return undefined;
	const n = Number(value);
	return Number.isFinite(n) ? n : undefined;
}

export type DemoShortProfile = z.infer<typeof profileShortSchema> &
	z.infer<typeof profileRightNowSchema>;

export function buildShortProfile(seed: DemoSeed): DemoShortProfile {
	const photos = photosOf(seed.id);
	return {
		profileId: seed.id,
		displayName: seed.name,
		onlineUntil: onlineUntilOf(seed),
		distance: seed.distanceM ?? null,
		profileImageMediaHash: photos[0] ?? null,
		isFavorite: demoFavoriteOf({ profileId: seed.id, seed: seed.favorite }),
		lastViewed: null,
		seen: lastOnlineOf(seed),
		rightNow: "NOT_ACTIVE",
		sexualPosition: seed.position,
		age: seed.age,
		showAge: seed.showAge,
		showDistance: seed.distanceM !== null,
		approximateDistance: seed.distanceM !== null && seed.distanceM > 1000,
		lastChatTimestamp: seed.unread > 0 ? NOW - 30 * MINUTE : null,
		isNew: seed.id % 5 === 0,
		lastUpdatedTime: NOW - ((seed.id % 6) + 1) * DAY,
		medias: mediasOf(seed),
		rightNowText: null,
		rightNowPosted: null,
		rightNowDistance: null,
		rightNowThumbnailUrl: null,
		rightNowFullImageUrl: null,
	};
}

export function buildFullProfile(seed: DemoSeed): Profile {
	return {
		...buildShortProfile(seed),
		meetAt: [],
		vaccines: [],
		genders: null,
		pronouns: null,
		nsfw: null,
		verifiedInstagramId: seed.instagram,
		isBlockable: true,
		showTribes: true,
		showPosition: seed.position !== null,
		aboutMe: seed.bio,
		ethnicity: seed.ethnicity,
		relationshipStatus: seed.relationship,
		grindrTribes: seed.tribes,
		lookingFor: seed.lookingFor,
		bodyType: seed.body,
		hivStatus: seed.hiv,
		lastTestedDate: seed.hiv ? NOW - 30 * DAY : null,
		height: seed.heightCm,
		weight: seed.weightG,
		socialNetworks: socialNetworksOf(seed),
		identity: null,
		hashtags: [],
		profileTags: [],
		tapped: false,
		tapType: null,
		lastReceivedTapTimestamp: null,
		isTeleporting: false,
		isRoaming: false,
		arrivalDays: null,
		unreadCount: seed.unread,
		lastThrobTimestamp: null,
		sexualHealth: [],
		isVisiting: false,
		travelPlans: [],
		isInAList: demoFavoriteOf({ profileId: seed.id, seed: seed.favorite }),
		tribesImInto: null,
		showVipBadge: false,
		rightNowShareLocation: null,
		rightNowMedias: [],
	};
}

type CascadeFullItem = z.infer<typeof cascadeV4ResponseFullProfileV1Schema>;
type CascadePartialItem = z.infer<
	typeof cascadeV4ResponsePartialProfileV1Schema
>;

function cascadeProfileData(seed: DemoSeed) {
	const photos = photosOf(seed.id);
	return {
		profileId: seed.id,
		onlineUntil: onlineUntilOf(seed),
		displayName: seed.name,
		distanceMeters: seed.distanceM ?? undefined,
		lastOnline: lastOnlineOf(seed),
		rightNow: "NOT_ACTIVE",
		unreadCount: seed.unread,
		isVisiting: false,
		isPopular: seed.favorite || seed.unread > 0,
		primaryImageUrl: photos[0]
			? `https://cdns.grindr.com/images/profile/480x480/${photos[0]}`
			: undefined,
		favorite: demoFavoriteOf({ profileId: seed.id, seed: seed.favorite }),
		viewed: false,
		chatted: seed.unread > 0,
		roaming: false,
		age: seed.age ?? undefined,
		heightCm: seed.heightCm ?? undefined,
		weightGrams: seed.weightG ?? undefined,
		bodyType: seed.body ?? undefined,
	};
}

function cascadeFullItem(seed: DemoSeed): CascadeFullItem {
	return { type: "full_profile_v1", data: cascadeProfileData(seed) };
}

function cascadePartialItem(seed: DemoSeed): CascadePartialItem {
	return {
		type: "partial_profile_v1",
		data: {
			...cascadeProfileData(seed),
			upsellItemType: "FREE_PROFILE_LIMIT",
		},
	};
}

const demoGridOrder: number[] = (() => {
	const ids = Array.from(
		{ length: DEMO_PROFILE_COUNT },
		(_, i) => DEMO_ID_START + i,
	);
	const distances = new Map(ids.map((id) => [id, distanceForId(id)]));
	return ids.sort((a, b) => distances.get(a)! - distances.get(b)! || a - b);
})();

function isPartialId(id: number): boolean {
	return id % 9 === 0;
}

function filteredGridIds(params: URLSearchParams): number[] {
	const favorites = params.get("favorites") === "true";
	const onlineOnly = params.get("onlineOnly") === "true";
	const ageMin = num(params.get("ageMin"));
	const ageMax = num(params.get("ageMax"));
	if (
		!favorites &&
		!onlineOnly &&
		ageMin === undefined &&
		ageMax === undefined
	) {
		return demoGridOrder;
	}
	return demoGridOrder.filter((id) => {
		const seed = profileSeed(id);
		if (
			favorites &&
			!demoFavoriteOf({ profileId: id, seed: seed.favorite })
		)
			return false;
		if (onlineOnly && !seed.online) return false;
		if (ageMin !== undefined && (seed.age === null || seed.age < ageMin))
			return false;
		if (ageMax !== undefined && (seed.age === null || seed.age > ageMax))
			return false;
		return true;
	});
}

export function demoCascadeV4(params: URLSearchParams) {
	const page = num(params.get("pageNumber")) ?? 0;
	const ids = filteredGridIds(params);
	const start = page * GRID_PAGE_SIZE;
	const slice = ids.slice(start, start + GRID_PAGE_SIZE);
	const items = slice.map((id) => {
		const seed = profileSeed(id);
		return isPartialId(id)
			? cascadePartialItem(seed)
			: cascadeFullItem(seed);
	});
	return {
		items,
		nextPage: start + GRID_PAGE_SIZE < ids.length ? page + 1 : null,
		shuffled: false,
		hiddenProfiles: null,
		hiddenProfileInfo: null,
	};
}

export function demoGetProfiles(profileIds: number[]): DemoShortProfile[] {
	return profileIds.map((id) => buildShortProfile(profileSeed(id)));
}

export function demoSearchProfiles(params: URLSearchParams) {
	const ids = filteredGridIds(params).slice(0, GRID_PAGE_SIZE);
	return ids.map((id) => {
		const photos = photosOf(id);
		const seed = profileSeed(id);
		return {
			profileId: id,
			displayName: seed.name,
			age: seed.age,
			distance: seed.distanceM ?? null,
			medias:
				photos.length > 0
					? photos.map((mediaHash) => ({ mediaHash }))
					: null,
		};
	});
}

export function demoMyUploadedPhotos() {
	return {
		medias: photosOf(demoMeProfileId).map((mediaHash) => ({
			mediaHash,
			type: 1,
			state: 2,
		})),
	};
}
