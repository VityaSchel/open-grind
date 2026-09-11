import { format, isSameYear } from "date-fns";

import { now } from "$lib/util/clock";

export function isVideoContent(contentType: string): boolean {
	return contentType.startsWith("video/");
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
