import { saveProfilePhotos } from "$lib/api/users/profiles";
import { deepEqual } from "$lib/util/deep-equal";

export async function saveProfilePhotoOrder({
	cacheProfileId,
	saved,
	kept,
}: {
	cacheProfileId: number;
	saved: readonly string[];
	kept: readonly string[];
}): Promise<void> {
	if (deepEqual(kept, saved)) return;
	await saveProfilePhotos({ cacheProfileId, mediaHashes: [...kept] });
}
