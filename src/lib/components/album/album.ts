import { type MediaFileKind, mediaFileKindOf } from "$lib/platform/media-file";
import type {
	AlbumContent,
	AlbumStorageLimits,
} from "$lib/model/messaging/albums";

export type AlbumRoom = { photos: boolean; videos: boolean };

export function isVideoContent(contentType: string): boolean {
	return mediaFileKindOf(contentType) === "video";
}

export function hasNoPlaysLeft(
	item: Pick<AlbumContent, "contentType" | "url">,
): boolean {
	return isVideoContent(item.contentType) && item.url === "";
}

export function albumCoverContent<
	Item extends Pick<AlbumContent, "processing">,
>(content: readonly Item[]): Item | undefined {
	return content.find((item) => !item.processing);
}

export function readyAlbumMedia(
	content: readonly Pick<AlbumContent, "contentType" | "processing">[],
): { count: number; hasPhoto: boolean; hasVideo: boolean } {
	const ready = content.filter((item) => !item.processing);
	return {
		count: ready.length,
		hasPhoto: ready.some((item) => !isVideoContent(item.contentType)),
		hasVideo: ready.some((item) => isVideoContent(item.contentType)),
	};
}

export function albumMediaCounts({
	content,
	pending,
}: {
	content: readonly Pick<AlbumContent, "contentType">[];
	pending: readonly { kind: MediaFileKind }[];
}): { photos: number; videos: number } {
	const contentVideos = content.filter((item) =>
		isVideoContent(item.contentType),
	).length;
	const pendingOf = (kind: MediaFileKind) =>
		pending.filter((upload) => upload.kind === kind).length;
	return {
		photos: content.length - contentVideos + pendingOf("photo"),
		videos: contentVideos + pendingOf("video"),
	};
}

export function albumRoom({
	content,
	pending,
	limits,
}: {
	content: readonly Pick<AlbumContent, "contentType">[];
	pending: readonly { kind: MediaFileKind }[];
	limits: Pick<
		AlbumStorageLimits,
		"maxContentItemsPerAlbum" | "maxVideosPerAlbum"
	>;
}): AlbumRoom {
	const { photos, videos } = albumMediaCounts({ content, pending });
	return {
		photos: photos < limits.maxContentItemsPerAlbum,
		videos: videos < limits.maxVideosPerAlbum,
	};
}

export function albumDisplayName(albumName: string | null): string {
	return albumName || "Untitled album";
}

export function albumItemCountLabel(count: number): string {
	return `${count} ${count === 1 ? "item" : "items"}`;
}
