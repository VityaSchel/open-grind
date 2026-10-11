import { vi } from "vitest";

import { ApiError } from "$lib/api/api-error";
import type { AlbumContentResponse } from "$lib/api/messaging/albums";
import type { AlbumContent } from "$lib/model/messaging/albums";
import type { PickedMedia } from "$lib/platform/media-picker";
import type {
	AlbumUploads,
	InspectedPick,
	UploadLimits,
} from "./album-uploads-state.svelte";

export const ALBUM_ID = 4;

export const OUR_PROFILE_ID = 11;

export const limits: UploadLimits = {
	maxContentSize: 125_829_120,
	maxContentItemsPerAlbum: 3,
	maxVideosPerAlbum: 1,
};

function media(key: string, mimeType: string): PickedMedia {
	return { key, mimeType, source: "desktop", path: `/tmp/${key}` };
}

export function pick(key: string, mimeType: string): InspectedPick {
	const kind = mimeType.startsWith("video/") ? "video" : "photo";
	return { media: media(key, mimeType), inspection: { kind, size: 1024 } };
}

export function albumItem(
	contentId: number,
	contentHash?: string,
): AlbumContent {
	return {
		contentId,
		contentType: "image/jpeg",
		coverUrl: null,
		statusId: 1,
		thumbUrl: "https://example.invalid/thumb.jpg",
		url: "https://example.invalid/full.jpg",
		processing: false,
		rejectionId: null,
		...(contentHash === undefined ? {} : { contentHash }),
	};
}

export function videoItem(
	contentId: number,
	processing: boolean,
): AlbumContent {
	return {
		...albumItem(contentId),
		contentType: "video/mp4",
		processing,
		statusId: processing ? 3 : 1,
	};
}

export function albumWith(...content: AlbumContent[]): AlbumContentResponse {
	return { content } as unknown as AlbumContentResponse;
}

export function httpError(status: number): ApiError {
	return new ApiError({
		message: `HTTP ${status}`,
		request: { method: "POST", path: "/v1/albums" },
		response: { status, body: "" },
	});
}

export function enqueue(uploads: AlbumUploads, ...inspected: InspectedPick[]) {
	uploads.enqueue({ albumId: ALBUM_ID, inspected, limits, content: [] });
}

export function draftSpy() {
	return { land: vi.fn(), replace: vi.fn(), forget: vi.fn() };
}
