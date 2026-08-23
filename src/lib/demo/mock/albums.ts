import { DAY, demoMeProfileId, NOW } from "../config";
import { picsum } from "./avatars";

function localDateTime(timestamp: number): string {
	return new Date(timestamp).toISOString().slice(0, 19);
}

export function albumCoverUrl(albumId: number): string {
	return picsum({ seed: `album-${albumId}-cover`, width: 300, height: 400 });
}

export function demoAlbumContent(albumId: number) {
	const count = 3 + (albumId % 3);
	const content = Array.from({ length: count }, (_, i) => {
		const thumb = picsum({
			seed: `album-${albumId}-${i}`,
			width: 300,
			height: 400,
		});
		return {
			contentId: albumId * 100 + i,
			contentType: "image/jpeg",
			coverUrl: thumb,
			statusId: 1,
			thumbUrl: thumb,
			url: picsum({ seed: `album-${albumId}-${i}` }),
			processing: false,
			rejectionId: null,
		};
	});
	return {
		albumId,
		hasUnseenContent: false,
		albumName: null,
		profileId: demoMeProfileId,
		albumViewable: true,
		sharedCount: 1,
		createdAt: localDateTime(NOW - 3 * DAY),
		updatedAt: localDateTime(NOW - DAY),
		content,
	};
}

const FIRST_ALBUM_ID = 900;
const demoSharedWithProfileId = 100001;

const demoAlbumSeeds = [
	{ albumName: "Weekend trip" },
	{ albumName: "Gym progress", hasVideo: true, shared: true },
	{ albumName: null, isShareable: false },
	{ albumName: "Studio", shared: true },
];

const albumShares = new Map<number, Set<number>>(
	demoAlbumSeeds.flatMap((seed, i) =>
		seed.shared
			? [[FIRST_ALBUM_ID + i, new Set([demoSharedWithProfileId])]]
			: [],
	),
);

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
		albums: demoAlbumSeeds.map((seed, i) => {
			const albumId = FIRST_ALBUM_ID + i;
			const album = demoAlbumContent(albumId);
			return {
				...album,
				albumName: seed.albumName,
				version: 1,
				isShareable: seed.isShareable ?? true,
				sharedCount:
					album.sharedCount + (albumShares.get(albumId)?.size ?? 0),
				content: album.content.map((item, j) =>
					seed.hasVideo && j === 0
						? { ...item, contentType: "video/mp4" }
						: item,
				),
			};
		}),
	};
}
