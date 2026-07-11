import { registerAccountCache } from "$lib/api/account-caches";
import { getCascadeV4 } from "$lib/api/browse/grid";
import { getProfiles } from "$lib/api/users/profiles";

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

export async function getGrid(query: Parameters<typeof getCascadeV4>[0]) {
	const response = await getCascadeV4(query);
	const items: GridProfile[] = [];

	for (const item of response.items) {
		if (item.type === "full_profile_v1" || item.type === "partial_profile_v1") {
			const profile = item.data;
			items.push({
				type: "rendered",
				id: profile.profileId,
				displayName: profile.displayName ?? null,
				distance: profile.distanceMeters ?? null,
				profilePhotosHashes: primaryImageHashes(profile.primaryImageUrl),
				unread: profile.unreadCount ?? null,
				onlineUntil: profile.onlineUntil ?? null,
				isFavorite: profile.favorite ?? false,
				isVisiting: profile.isVisiting,
				hasChattedInLast24Hrs: profile.chatted ?? false,
			});
		} else if (
			item.type === "hidden_profile_v1" ||
			item.type === "smart_boost_profile_v1"
		) {
			// Seems like a dead branch for now
			const profile = item.data;
			items.push({
				type: "lazy",
				id: profile.profileId,
				unread: profile.unreadCount ?? null,
				isVisiting: profile.isVisiting,
			});
		} else if (item.type === "sponsored_profile_v1") {
			// Seems like a dead branch for now
			const profile = item.data.alternativeProfile;
			items.push({
				type: "lazy",
				id: profile.profileId,
				unread: profile.unreadCount ?? null,
				isVisiting: profile.isVisiting,
			});
		}
	}

	return {
		items,
		nextPage: response.nextPage,
		shuffled: response.shuffled,
	};
}

const PROFILE_CACHE_TTL_MS = 60_000;

const profileCache = new Map<
	number,
	{ profile: RenderedGridProfile; updatedAt: number }
>();

export function getCachedProfile(id: number): RenderedGridProfile | null {
	const cached = profileCache.get(id);
	if (!cached || Date.now() - cached.updatedAt >= PROFILE_CACHE_TTL_MS) {
		return null;
	}
	return cached.profile;
}

export function setCachedProfile(profile: RenderedGridProfile): void {
	profileCache.set(profile.id, { profile, updatedAt: Date.now() });
}

registerAccountCache(() => profileCache.clear());

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
			Date.now() - resolved.lastChatTimestamp < 24 * 60 * 60 * 1000,
	};
}
