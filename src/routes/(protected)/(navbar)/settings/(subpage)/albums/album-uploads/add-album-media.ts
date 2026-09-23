import { toast } from "svelte-sonner";

import { showErrorToast } from "$lib/api/error-toast";
import { getAlbumStorageLimits } from "$lib/api/messaging/albums";
import { albumMediaCounts } from "$lib/components/album/album";
import {
	inspectMediaFile,
	type MediaFileInspection,
} from "$lib/platform/media-file";
import {
	type PickedMedia,
	pickMultipleMedia,
} from "$lib/platform/media-picker";
import type { AlbumContent } from "$lib/model/messaging/albums";
import type {
	AlbumUploads,
	InspectedPick,
	UploadLimits,
} from "./album-uploads-state.svelte";

const UNSUPPORTED_MESSAGE = "That file isn't a photo or video";

function isUploadable(
	inspection: MediaFileInspection,
): inspection is InspectedPick["inspection"] {
	return inspection.kind !== "unsupported";
}

async function inspectPicks(picked: PickedMedia[]): Promise<InspectedPick[]> {
	const inspected: InspectedPick[] = [];
	for (const media of picked) {
		const inspection = await inspectMediaFile(media).catch(() => null);
		if (inspection === null || !isUploadable(inspection)) {
			toast.error(UNSUPPORTED_MESSAGE);
			continue;
		}
		inspected.push({ media, inspection });
	}
	return inspected;
}

export async function pickInspectedAlbumMedia({
	videoRoom,
}: {
	videoRoom: boolean;
}): Promise<InspectedPick[]> {
	return await inspectPicks(
		await pickMultipleMedia(videoRoom ? "media" : "image"),
	);
}

function hasVideoRoom({
	uploads,
	albumId,
	content,
	limits,
}: {
	uploads: AlbumUploads;
	albumId: number;
	content: AlbumContent[];
	limits: UploadLimits;
}): boolean {
	const { photos, videos } = albumMediaCounts({
		content,
		pending: uploads.pending(albumId),
	});
	return (
		videos < limits.maxVideosPerAlbum &&
		photos < limits.maxContentItemsPerAlbum
	);
}

function videoLimitMessage(maxVideosPerAlbum: number): string {
	const noun = maxVideosPerAlbum === 1 ? "video" : "videos";
	return `You can have ${maxVideosPerAlbum} ${noun} in your album. Remove one to add another.`;
}

export function enqueueAlbumMedia({
	uploads,
	albumId,
	inspected,
	limits,
	content,
}: {
	uploads: AlbumUploads;
	albumId: number;
	inspected: InspectedPick[];
	limits: UploadLimits;
	content: AlbumContent[];
}): void {
	const { leftOutFull, leftOutVideoSlot } = uploads.enqueue({
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
	uploads,
	albumId,
	content,
}: {
	uploads: AlbumUploads;
	albumId: number;
	content: () => AlbumContent[];
}): Promise<void> {
	try {
		const limits = await getAlbumStorageLimits();
		const inspected = await pickInspectedAlbumMedia({
			videoRoom: hasVideoRoom({
				uploads,
				albumId,
				content: content(),
				limits,
			}),
		});
		if (inspected.length === 0) return;
		enqueueAlbumMedia({
			uploads,
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
