import { format, isSameYear } from "date-fns";

import { now } from "$lib/util/clock";
import type { AlbumContent } from "$lib/model/messaging/albums";

export function isVideoContent(contentType: string): boolean {
	return contentType.startsWith("video/");
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

export function albumDisplayName(albumName: string | null): string {
	return albumName || "Untitled album";
}

export function albumItemCountLabel(count: number): string {
	return `${count} ${count === 1 ? "item" : "items"}`;
}

export function albumUpdatedLabel(updatedAt: string): string {
	const date = new Date(updatedAt);
	return format(date, isSameYear(date, now()) ? "MMM d" : "MMM d, yyyy");
}
