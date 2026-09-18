import { goto } from "$app/navigation";
import { toast } from "svelte-sonner";

import { ApiError } from "$lib/api/api-error";
import { showErrorToast } from "$lib/api/error-toast";
import { createAlbum } from "$lib/api/messaging/albums";
import {
	enqueueAlbumMedia,
	pickAlbumMedia,
} from "../album-uploads/add-album-media";
import { inspectPicks, uploads } from "../album-uploads/album-uploads.svelte";

const ALBUM_LIMIT_MESSAGE = "You can't create more albums";

function isAlbumLimitReached(error: unknown): boolean {
	return error instanceof ApiError && error.response?.status === 402;
}

export async function createAlbumFromMedia({
	albumName,
}: {
	albumName: string | null;
}): Promise<void> {
	try {
		const limits = await uploads.storageLimits();
		const picked = await pickAlbumMedia(limits.maxVideosPerAlbum > 0);
		if (picked.length === 0) return;
		const inspected = await inspectPicks(picked);
		if (inspected.length === 0) return;
		const { albumId } = await createAlbum({ albumName });
		await goto(`/albums/${albumId}`, { replaceState: true });
		await enqueueAlbumMedia({ albumId, inspected, limits, content: [] });
	} catch (error) {
		console.error(error);
		if (isAlbumLimitReached(error)) {
			toast.error(ALBUM_LIMIT_MESSAGE);
			return;
		}
		showErrorToast({ label: "Couldn't create album", error });
	}
}
