import { demoMeProfileId } from "../../../src/lib/demo/config";
import type { DemoInbox } from "../../../src/lib/demo/mock/conversation-seeds";
import type { RestFault } from "../../../src/lib/demo/screenshot-scene";

const PROCESSING_URL =
	"https://d3w4wp6rol9nvz.cloudfront.net/https://d1weu1y74qn7ma.cloudfront.net/albums-video-loading.mp4";
const THUMB = { width: 300, height: 400 };
const FULL = { width: 600, height: 800 };

export const ALBUM_PEER_ID = 100001;
export const VIDEO_ALBUM_ID = 5001;
export const PLAYED_OUT_ALBUM_ID = 5004;

export type AlbumSlot = { video?: boolean; processing?: boolean };

export const ALBUMS_INBOX: DemoInbox = {
	nextPage: null,
	conversations: [
		{
			withId: ALBUM_PEER_ID,
			unread: 0,
			pinned: false,
			favorite: false,
			muted: false,
			lastActivityAgo: 4,
			messages: [
				{ fromMe: false, kind: "album", albumId: VIDEO_ALBUM_ID },
				{ fromMe: true, text: "Lorem ipsum dolor sit amet." },
				{ fromMe: false, kind: "album", albumId: PLAYED_OUT_ALBUM_ID },
			],
		},
	],
};

export function albumContentId({
	albumId,
	slot,
}: {
	albumId: number;
	slot: number;
}): number {
	return albumId * 100 + slot;
}

function photoUrl({
	albumId,
	slot,
	width,
	height,
}: {
	albumId: number;
	slot: number;
	width: number;
	height: number;
}): string {
	return `https://picsum.photos/seed/album-${albumId}-${slot}/${width}/${height}`;
}

export function albumMediaUrl({
	albumId,
	slot,
}: {
	albumId: number;
	slot: number;
}): string {
	return photoUrl({ albumId, slot, ...FULL });
}

function contentItem({
	albumId,
	slot,
	video = false,
	processing = false,
}: AlbumSlot & { albumId: number; slot: number }) {
	const thumb = processing
		? PROCESSING_URL
		: photoUrl({ albumId, slot, ...THUMB });
	return {
		contentId: albumContentId({ albumId, slot }),
		contentType: video ? "video/mp4" : "image/jpeg",
		coverUrl: thumb,
		statusId: processing ? 3 : 1,
		thumbUrl: thumb,
		url: processing ? PROCESSING_URL : albumMediaUrl({ albumId, slot }),
		processing,
		rejectionId: null,
	};
}

export function albumAnswer({
	albumId,
	name,
	slots,
}: {
	albumId: number;
	name: string;
	slots: AlbumSlot[];
}): RestFault {
	return {
		method: "GET",
		path: `/v2/albums/${albumId}`,
		status: 200,
		body: {
			albumId,
			hasUnseenContent: false,
			albumName: name,
			profileId: demoMeProfileId,
			albumViewable: true,
			sharedCount: 0,
			createdAt: "2026-07-18T09:30:00",
			updatedAt: "2026-07-20T09:30:00",
			content: slots.map((slot, index) =>
				contentItem({ albumId, slot: index, ...slot }),
			),
		},
	};
}
