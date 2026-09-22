import type { AlbumStorageLimits } from "$lib/model/messaging/albums";
import type { MediaFileKind } from "$lib/platform/media-file";
import { DAY, demoMeProfileId, NOW } from "../config";
import { picsum, unsplash } from "./avatars";

function localDateTime(timestamp: number): string {
	return new Date(timestamp).toISOString().slice(0, 19);
}

export const albumProcessingPlaceholderUrl =
	"https://d3w4wp6rol9nvz.cloudfront.net/https://d1weu1y74qn7ma.cloudfront.net/albums-video-loading.mp4";

export const demoAlbumStorageLimits = {
	subscriptionType: "FreeAlbums",
	maxAlbums: 5,
	maxContentItemsPerAlbum: 10,
	maxShares: 5000,
	maxViewableAlbums: 5,
	maxViewableVideos: 1,
	maxContentSize: 125829120,
	maxContentSizeHumanReadable: "120.00 MB",
	maxVideoLength: 15000,
	minVideoLength: 1,
	maxShareableAlbums: 1,
	maxVideosPerAlbum: 1,
} satisfies AlbumStorageLimits;

const UNSPLASH_COVER_BLUR = 30;
const UNSPLASH_ALBUM_COVERS = new Map([[5004, "1645973342475-e9fcd3fc0d39"]]);

export function albumCoverUrl(albumId: number): string {
	const photo = UNSPLASH_ALBUM_COVERS.get(albumId);
	if (photo) {
		return unsplash({
			photo,
			width: 300,
			height: 400,
			blur: UNSPLASH_COVER_BLUR,
		});
	}
	return picsum({ seed: `album-${albumId}-cover`, width: 300, height: 400 });
}

const FIRST_ALBUM_ID = 900;
const demoSharedWithProfileId = 100001;

const demoAlbumSeeds = [
	{ albumName: "Weekend trip", sharedWith: [] as number[] },
	{
		albumName: "Gym progress",
		hasVideo: true,
		sharedWith: [demoSharedWithProfileId],
	},
	{ albumName: null, isShareable: false, sharedWith: [] as number[] },
	{
		albumName: "Studio",
		sharedWith: [
			demoSharedWithProfileId,
			...Array.from({ length: 12 }, (_, index) => 100901 + index),
		],
	},
];

const albumNames = new Map<number, string | null>(
	demoAlbumSeeds.map((seed, index) => [
		FIRST_ALBUM_ID + index,
		seed.albumName,
	]),
);

const albumShares = new Map<number, Set<number>>(
	demoAlbumSeeds.map((seed, index) => [
		FIRST_ALBUM_ID + index,
		new Set(seed.sharedWith),
	]),
);

const createdAlbumIds: number[] = [];
const deletedContentIds = new Set<number>();
const deletedAlbumIds = new Set<number>();
const contentOrder = new Map<number, number[]>();
type UploadedContent = { slot: number; video: boolean; processing: boolean };

const uploadedContent = new Map<number, UploadedContent[]>();
const FIRST_UPLOADED_SLOT = 50;
const DEMO_PROCESSING_MS = 3000;

const playedOutAlbumIds = new Set([5004]);

const videoSlotByAlbum = new Map<number, "first" | "last">([
	[5001, "last"],
	[5004, "last"],
	...demoAlbumSeeds.flatMap<[number, "first"]>((seed, index) =>
		seed.hasVideo ? [[FIRST_ALBUM_ID + index, "first"]] : [],
	),
]);

function demoContentId({
	albumId,
	slot,
}: {
	albumId: number;
	slot: number;
}): number {
	return albumId * 100 + slot;
}

function demoContentItem({
	albumId,
	slot,
	video,
	processing = false,
}: {
	albumId: number;
	slot: number;
	video: boolean;
	processing?: boolean;
}) {
	const playedOut = video && playedOutAlbumIds.has(albumId);
	const media = playedOut ? "" : picsum({ seed: `album-${albumId}-${slot}` });
	const thumb = picsum({
		seed: `album-${albumId}-${slot}`,
		width: 300,
		height: 400,
	});
	return {
		contentId: demoContentId({ albumId, slot }),
		contentType: video ? "video/mp4" : "image/jpeg",
		coverUrl: processing ? albumProcessingPlaceholderUrl : thumb,
		statusId: processing ? 3 : 1,
		thumbUrl: processing ? albumProcessingPlaceholderUrl : thumb,
		url: processing ? albumProcessingPlaceholderUrl : media,
		processing,
		rejectionId: null,
	};
}

export function demoAlbumContent(albumId: number) {
	const count = createdAlbumIds.includes(albumId) ? 0 : 3 + (albumId % 3);
	const videoSlot = videoSlotByAlbum.get(albumId);
	const seeded = Array.from({ length: count }, (_, i) =>
		demoContentItem({
			albumId,
			slot: i,
			video:
				videoSlot === "first"
					? i === 0
					: videoSlot === "last" && i === count - 1,
		}),
	);
	const uploaded = (uploadedContent.get(albumId) ?? []).map((item) =>
		demoContentItem({ albumId, ...item }),
	);
	const content = [...uploaded, ...seeded].filter(
		({ contentId }) => !deletedContentIds.has(contentId),
	);
	const order = contentOrder.get(albumId);
	if (order !== undefined) {
		const position = new Map(order.map((id, index) => [id, index]));
		content.sort(
			(a, b) =>
				(position.get(a.contentId) ?? order.length) -
				(position.get(b.contentId) ?? order.length),
		);
	}
	return {
		albumId,
		hasUnseenContent: false,
		albumName: albumNames.get(albumId) ?? null,
		profileId: demoMeProfileId,
		albumViewable: true,
		sharedCount: albumShares.get(albumId)?.size ?? 0,
		createdAt: localDateTime(NOW - 3 * DAY),
		updatedAt: localDateTime(NOW - DAY),
		content,
	};
}

export function demoCreateAlbum({
	albumName,
}: {
	albumName: string | null;
}): { albumId: number; albumName: string | null } | null {
	if (demoMyAlbums().albums.length >= demoAlbumStorageLimits.maxAlbums)
		return null;
	const albumId =
		FIRST_ALBUM_ID + demoAlbumSeeds.length + createdAlbumIds.length;
	createdAlbumIds.push(albumId);
	albumNames.set(albumId, albumName);
	return { albumId, albumName };
}

export function demoAlbumContentProcessing({
	albumId,
	contentId,
}: {
	albumId: number;
	contentId: number;
}): { processing: boolean } | null {
	const item = demoAlbumContent(albumId).content.find(
		(candidate) => candidate.contentId === contentId,
	);
	return item === undefined ? null : { processing: item.processing };
}

export function demoRenameAlbum({
	albumId,
	albumName,
}: {
	albumId: number;
	albumName: string | null;
}): { albumId: number; albumName: string | null } {
	albumNames.set(albumId, albumName);
	return { albumId, albumName };
}

export function demoDeleteAlbumContent(contentId: number): void {
	deletedContentIds.add(contentId);
}

export function demoReorderAlbumContent({
	albumId,
	contentIds,
}: {
	albumId: number;
	contentIds: number[];
}): void {
	contentOrder.set(albumId, contentIds);
}

export function demoDeleteAlbum(albumId: number): void {
	deletedAlbumIds.add(albumId);
}

export function demoAlbumExists(albumId: number): boolean {
	return !deletedAlbumIds.has(albumId);
}

export function demoShareAlbum({
	albumId,
	profileIds,
}: {
	albumId: number;
	profileIds: number[];
}): void {
	const shared = albumShares.get(albumId) ?? new Set<number>();
	for (const profileId of profileIds) shared.add(profileId);
	albumShares.set(albumId, shared);
}

export function demoUnshareAlbum({
	albumId,
	profileIds,
}: {
	albumId: number;
	profileIds: number[];
}): void {
	const shared = albumShares.get(albumId);
	if (shared === undefined) return;
	for (const profileId of profileIds) shared.delete(profileId);
}

export function demoAlbumShares(albumId: number): number[] {
	return [...(albumShares.get(albumId) ?? [])];
}

function demoContentHash(contentId: number): string {
	return contentId.toString(16).padStart(64, "0");
}

export function demoUploadAlbumContent({
	albumId,
	kind,
}: {
	albumId: number;
	kind: MediaFileKind;
}): { contentId: number; sha256: string } {
	const uploaded = uploadedContent.get(albumId) ?? [];
	const video = kind === "video";
	const item: UploadedContent = {
		slot: FIRST_UPLOADED_SLOT + uploaded.length,
		video,
		processing: video,
	};
	uploadedContent.set(albumId, [item, ...uploaded]);
	if (video) {
		setTimeout(() => {
			item.processing = false;
		}, DEMO_PROCESSING_MS);
	}
	const contentId = demoContentId({ albumId, slot: item.slot });
	return { contentId, sha256: demoContentHash(contentId) };
}

export function demoMyAlbums() {
	const albums = [
		...demoAlbumSeeds.map((seed, index) => ({
			albumId: FIRST_ALBUM_ID + index,
			isShareable: seed.isShareable ?? true,
		})),
		...createdAlbumIds.map((albumId) => ({ albumId, isShareable: true })),
	];
	return {
		albums: albums
			.filter(({ albumId }) => demoAlbumExists(albumId))
			.map(({ albumId, isShareable }) => {
				const album = demoAlbumContent(albumId);
				return {
					...album,
					content: album.content.map((item) => ({
						...item,
						contentHash: demoContentHash(item.contentId),
					})),
					version: 1,
					isShareable,
				};
			}),
	};
}
