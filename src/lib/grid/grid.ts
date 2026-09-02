import type z from "zod";

import { getCascadeV4 } from "$lib/api/browse/grid";
import { TtlCache } from "$lib/api/cache";
import { getProfiles } from "$lib/api/users/profiles";
import { now } from "$lib/util/clock";
import type { cascadeV4ResponseFullProfileV1Schema } from "$lib/model/browse/grid/cascade/response/v4";

type CascadeProfileData = z.infer<
	typeof cascadeV4ResponseFullProfileV1Schema
>["data"];

function primaryImageHashes(url: string | null | undefined): string[] | null {
	const hash = url?.split("/").pop();
	return hash ? [hash] : null;
}

export type RenderedGridProfile = {
	type: "rendered";
	id: number;
	displayName: string | null;
	distance: number | null;
	profilePhotosHashes: string[] | null;
	unread: number | null;
	onlineUntil: number | null;
	isFavorite: boolean;
	isVisiting: boolean;
	hasChattedInLast24Hrs: boolean;
};

export type LazyGridProfile = {
	type: "lazy";
	id: number;
	unread: number | null;
	isVisiting: boolean;
};

export type GridProfile = RenderedGridProfile | LazyGridProfile;

function lazyProfile(profile: {
	profileId: number;
	unreadCount?: number | null;
	isVisiting?: boolean | null;
}): LazyGridProfile {
	return {
		type: "lazy",
		id: profile.profileId,
		unread: profile.unreadCount ?? null,
		isVisiting: profile.isVisiting ?? false,
	};
}

// v4 sends `favorite`/`chatted` on every profile item; their absence marks a
// base-shaped payload, which carries no photo to render from either.
function gridProfile(profile: CascadeProfileData): GridProfile {
	const { favorite, chatted } = profile;
	if (favorite === undefined || chatted === undefined) {
		return lazyProfile(profile);
	}
	return {
		type: "rendered",
		id: profile.profileId,
		displayName: profile.displayName ?? null,
		distance: profile.distanceMeters ?? null,
		profilePhotosHashes: primaryImageHashes(profile.primaryImageUrl),
		unread: profile.unreadCount ?? null,
		onlineUntil: profile.onlineUntil ?? null,
		isFavorite: favorite,
		isVisiting: profile.isVisiting ?? false,
		hasChattedInLast24Hrs: chatted,
	};
}

export async function getGrid(query: Parameters<typeof getCascadeV4>[0]) {
	const response = await getCascadeV4(query);
	const items: GridProfile[] = [];

	for (const item of response.items) {
		if (
			item.type === "full_profile_v1" ||
			item.type === "partial_profile_v1" ||
			item.type === "hidden_profile_v1" ||
			item.type === "smart_boost_profile_v1"
		) {
			items.push(gridProfile(item.data));
		} else if (item.type === "sponsored_profile_v1") {
			items.push(gridProfile(item.data.alternativeProfile));
		}
	}

	return { items, nextPage: response.nextPage, shuffled: response.shuffled };
}

const profileCache = new TtlCache<number, RenderedGridProfile>({
	ttlMs: 60_000,
});

export function getCachedProfile(id: number): RenderedGridProfile | null {
	return profileCache.get(id);
}

export function setCachedProfile(profile: RenderedGridProfile): void {
	profileCache.set(profile.id, profile);
}

export function patchCachedProfile({
	id,
	patch,
}: {
	id: number;
	patch: Partial<RenderedGridProfile>;
}): void {
	profileCache.update(id, (profile) => ({ ...profile, ...patch }));
}

export async function resolveLazyProfile(
	profile: LazyGridProfile,
): Promise<RenderedGridProfile | null> {
	const [resolved] = await getProfiles([profile.id]);
	if (!resolved || resolved.profileId !== profile.id) return null;
	return {
		type: "rendered",
		id: resolved.profileId,
		displayName: resolved.displayName ?? null,
		distance: resolved.distance ?? null,
		profilePhotosHashes: resolved.medias?.map((m) => m.mediaHash) ?? null,
		unread: profile.unread,
		onlineUntil: resolved.onlineUntil ?? null,
		isFavorite: resolved.isFavorite,
		isVisiting: profile.isVisiting,
		hasChattedInLast24Hrs:
			resolved.lastChatTimestamp !== null &&
			now() - resolved.lastChatTimestamp < 24 * 60 * 60 * 1000,
	};
}
