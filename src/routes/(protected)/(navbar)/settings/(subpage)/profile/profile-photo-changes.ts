import {
	deleteProfilePhotos,
	saveProfilePhotos,
} from "$lib/api/users/profiles";

export function profilePhotoChanges({
	saved,
	sent,
}: {
	saved: readonly string[];
	sent: readonly string[];
}): { order: string[] | null; removed: string[] } {
	const kept = new Set(sent);
	const unchanged =
		sent.length === saved.length &&
		sent.every((hash, index) => hash === saved[index]);
	return {
		order: unchanged ? null : [...sent],
		removed: saved.filter((hash) => !kept.has(hash)),
	};
}

export async function saveProfilePhotoChanges({
	cacheProfileId,
	changes,
}: {
	cacheProfileId: number;
	changes: { order: string[] | null; removed: string[] };
}): Promise<void> {
	if (changes.order !== null) {
		await saveProfilePhotos({ cacheProfileId, mediaHashes: changes.order });
	}
	await deleteProfilePhotos({ cacheProfileId, mediaHashes: changes.removed });
}
