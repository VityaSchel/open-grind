import { getCascadeV3 } from "$lib/api/grid";
import { getProfiles } from "$lib/api/users/profiles";

export type FullGridProfile = {
	type: "full";
	id: number;
	displayName: string | null;
	distance: number | null;
	profilePhotosHashes: string[] | null;
	unread: number | null;
	onlineUntil: number | null;
	isFavorite: boolean;
	hasChattedInLast24Hrs: boolean;
};

export type PartialGridProfile = {
	type: "partial";
	id: number;
	batchIndex: number;
};

export type GridProfile = FullGridProfile | PartialGridProfile;

export async function getGrid(query: Parameters<typeof getCascadeV3>[0]) {
	const response = await getCascadeV3(query);
	const items: GridProfile[] = [];
	const partialBatches: { batch: { profileId: number }[] }[] = [];
	let currentBatch: { profileId: number }[] = [];

	for (const item of response.items) {
		if (item.type === "full_profile_v1") {
			const profile = item.data;
			items.push({
				type: "full",
				id: profile.profileId,
				displayName: profile.displayName ?? null,
				distance: profile.distanceMeters ?? null,
				profilePhotosHashes: profile.photoMediaHashes,
				unread: profile.unreadCount ?? null,
				onlineUntil: profile.onlineUntil ?? null,
				isFavorite: profile.isFavorite,
				hasChattedInLast24Hrs: profile.hasChattedInLast24Hrs,
			});
		} else if (item.type === "partial_profile_v1") {
			if (currentBatch.length === 150) {
				partialBatches.push({ batch: currentBatch });
				currentBatch = [];
			}
			const batchIndex = partialBatches.length;
			currentBatch.push({ profileId: item.data.profileId });
			items.push({
				type: "partial",
				id: item.data.profileId,
				batchIndex,
			});
		}
	}
	if (currentBatch.length > 0) {
		partialBatches.push({ batch: currentBatch });
	}

	return {
		items,
		partialBatches,
		nextPage: response.nextPage,
		shuffled: response.shuffled,
	};
}

export const profileCache = new Map<number, FullGridProfile>();

export async function resolvePartialBatch(
	profileIds: number[],
): Promise<FullGridProfile[]> {
	const profiles = await getProfiles(profileIds);
	return profiles
		.filter(({ profileId }) => profileIds.includes(profileId))
		.sort(
			(a, b) =>
				profileIds.indexOf(a.profileId) - profileIds.indexOf(b.profileId),
		)
		.map((profile) => ({
			type: "full" as const,
			id: profile.profileId,
			displayName: profile.displayName ?? null,
			distance: profile.distance ?? null,
			profilePhotosHashes: profile.medias?.map((m) => m.mediaHash) ?? null,
			unread: null,
			onlineUntil: profile.onlineUntil ?? null,
			isFavorite: profile.isFavorite,
			hasChattedInLast24Hrs:
				profile.lastChatTimestamp !== null &&
				Date.now() - profile.lastChatTimestamp < 24 * 60 * 60 * 1000,
		}));
}
