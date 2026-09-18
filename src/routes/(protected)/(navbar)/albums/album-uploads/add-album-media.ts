import { toast } from "svelte-sonner";

import { showErrorToast } from "$lib/api/error-toast";
import { isVideoContent } from "$lib/components/album/album";
import { pickMultipleMedia } from "$lib/platform/media-picker";
import type { AlbumContent } from "$lib/model/messaging/albums";
import {
	type InspectedPick,
	inspectPicks,
	type UploadLimits,
	uploads,
} from "./album-uploads.svelte";

function hasVideoRoom({
	albumId,
	content,
	limits,
}: {
	albumId: number;
	content: AlbumContent[];
	limits: UploadLimits;
}): boolean {
	const pending = uploads.pending(albumId);
	const videos =
		content.filter((item) => isVideoContent(item.contentType)).length +
		pending.filter(({ kind }) => kind === "video").length;
	const photos =
		content.filter((item) => !isVideoContent(item.contentType)).length +
		pending.filter(({ kind }) => kind === "photo").length;
	return (
		videos < limits.maxVideosPerAlbum &&
		photos < limits.maxContentItemsPerAlbum
	);
}

export function pickAlbumMedia(videoRoom: boolean) {
	return pickMultipleMedia(videoRoom ? "media" : "image");
}

function videoLimitMessage(maxVideosPerAlbum: number): string {
	const noun = maxVideosPerAlbum === 1 ? "video" : "videos";
	return `You can have ${maxVideosPerAlbum} ${noun} in your album. Remove one to add another.`;
}

export async function enqueueAlbumMedia({
	albumId,
	inspected,
	limits,
	content,
}: {
	albumId: number;
	inspected: InspectedPick[];
	limits: UploadLimits;
	content: AlbumContent[];
}): Promise<void> {
	const { leftOutFull, leftOutVideoSlot } = await uploads.enqueue({
		albumId,
		inspected,
		limits,
		content,
	});
	if (leftOutVideoSlot > 0)
		toast.error(videoLimitMessage(limits.maxVideosPerAlbum));
	if (leftOutFull > 0)
		toast.error(`${leftOutFull} left out, the album is full`);
}

export async function addAlbumMedia({
	albumId,
	content,
}: {
	albumId: number;
	content: () => AlbumContent[];
}): Promise<void> {
	try {
		const limits = await uploads.storageLimits();
		const picked = await pickAlbumMedia(
			hasVideoRoom({ albumId, content: content(), limits }),
		);
		if (picked.length === 0) return;
		const inspected = await inspectPicks(picked);
		if (inspected.length === 0) return;
		await enqueueAlbumMedia({
			albumId,
			inspected,
			limits,
			content: content(),
		});
	} catch (error) {
		console.error(error);
		showErrorToast({ label: "Couldn't add to album", error });
	}
}
