import { toast } from "svelte-sonner";

import { showErrorToast } from "$lib/api/error-toast";
import { isVideoContent } from "$lib/components/album/album";
import { pickMultipleMedia } from "$lib/platform/media-picker";
import type { AlbumContent } from "$lib/model/messaging/albums";
import {
	type UploadLimits,
	uploads,
} from "../album-uploads/album-uploads.svelte";

function hasVideoRoom({
	albumId,
	content,
	limits,
}: {
	albumId: number;
	content: AlbumContent[];
	limits: UploadLimits;
}): boolean {
	const landed = content.filter((item) =>
		isVideoContent(item.contentType),
	).length;
	const queued = uploads
		.pending(albumId)
		.filter(({ kind }) => kind === "video").length;
	return landed + queued < limits.maxVideosPerAlbum;
}

export async function addAlbumMedia({
	albumId,
	content,
}: {
	albumId: number;
	content: AlbumContent[];
}): Promise<void> {
	try {
		const limits = await uploads.storageLimits();
		const picked = await pickMultipleMedia(
			hasVideoRoom({ albumId, content, limits }) ? "media" : "image",
		);
		if (picked.length === 0) return;
		const { full } = await uploads.enqueue({
			albumId,
			picked,
			limits,
			content,
		});
		if (full > 0) toast.error(`${full} left out, the album is full`);
	} catch (error) {
		console.error(error);
		showErrorToast({ label: "Couldn't add to album", error });
	}
}
