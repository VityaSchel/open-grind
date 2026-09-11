import { DAY, demoMeProfileId, NOW } from "../config";
import { picsum, unsplash } from "./avatars";

function localDateTime(timestamp: number): string {
	return new Date(timestamp).toISOString().slice(0, 19);
}

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

const deletedContentIds = new Set<number>();
const deletedAlbumIds = new Set<number>();
const contentOrder = new Map<number, number[]>();

const videoSlotByAlbum = new Map<number, "first" | "last">([
	[5001, "last"],
	[5004, "last"],
	...demoAlbumSeeds.flatMap<[number, "first"]>((seed, index) =>
		seed.hasVideo ? [[FIRST_ALBUM_ID + index, "first"]] : [],
	),
]);

export function demoAlbumContent(albumId: number) {
	const count = 3 + (albumId % 3);
	const content = Array.from({ length: count }, (_, i) => {
		const thumb = picsum({
			seed: `album-${albumId}-${i}`,
			width: 300,
			height: 400,
		});
		const videoSlot = videoSlotByAlbum.get(albumId);
		const video =
			videoSlot === "first"
				? i === 0
				: videoSlot === "last" && i === count - 1;
		return {
			contentId: albumId * 100 + i,
			contentType: video ? "video/mp4" : "image/jpeg",
			coverUrl: thumb,
			statusId: 1,
			thumbUrl: thumb,
			url: picsum({ seed: `album-${albumId}-${i}` }),
			processing: false,
			rejectionId: null,
		};
	}).filter(({ contentId }) => !deletedContentIds.has(contentId));
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

export function demoMyAlbums() {
	return {
		albums: demoAlbumSeeds.flatMap((seed, i) => {
			const albumId = FIRST_ALBUM_ID + i;
			if (!demoAlbumExists(albumId)) return [];
			return {
				...demoAlbumContent(albumId),
				version: 1,
				isShareable: seed.isShareable ?? true,
			};
		}),
	};
}
