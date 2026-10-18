import {
	type MediaFileInspection,
	mediaFileKindOf,
	type MediaPreview,
} from "$lib/platform/media-file";
import type { DrawerMedia } from "$lib/api/messaging/drawer";
import type { MessageDraft } from "$lib/model/messaging/messages";

const VIEW_ONCE_MAX_VIEWS = 1;

const REPLAYABLE_MAX_VIEWS = 2;

function imageHashFromUrl(url: string): string {
	return /([0-9a-f]{64}|[0-9a-f]{40})/i.exec(url)?.[1] ?? "";
}

function videoMessageDraft({
	item,
	expiring,
}: {
	item: DrawerMedia;
	expiring: boolean;
}): MessageDraft {
	const maxViews = expiring ? VIEW_ONCE_MAX_VIEWS : REPLAYABLE_MAX_VIEWS;
	return {
		outbound: {
			type: "Video",
			body: { mediaId: item.id, looping: false, maxViews },
		},
		optimistic: {
			type: "Video",
			body: {
				mediaId: item.id,
				url: item.url,
				contentType: item.contentType,
				length: 0,
				maxViews,
				viewsRemaining: maxViews,
				looping: false,
			},
		},
	};
}

export function mediaMessageDraft({
	item,
	expiring,
}: {
	item: DrawerMedia;
	expiring: boolean;
}): MessageDraft {
	if (mediaFileKindOf(item.contentType) === "video") {
		return videoMessageDraft({ item, expiring });
	}
	const mediaBody = {
		mediaId: item.id,
		width: null,
		height: null,
		url: item.url,
	};
	if (expiring) {
		return {
			outbound: {
				type: "ExpiringImage",
				body: { mediaId: item.id, expiring: true },
			},
			optimistic: { type: "ExpiringImage", body: mediaBody },
		};
	}
	return {
		outbound: { type: "Image", body: { mediaId: item.id } },
		optimistic: {
			type: "Image",
			body: {
				...mediaBody,
				imageHash: imageHashFromUrl(item.url),
				takenOnGrindr: item.takenOnGrindr,
				createdAt: item.createdTs,
			},
		},
	};
}

export function sendNowDraft({
	inspection,
	preview,
	upload,
}: {
	inspection: MediaFileInspection & { kind: "photo" | "video" };
	preview: MediaPreview | null;
	upload: () => Promise<number>;
}): MessageDraft {
	if (inspection.kind === "video") {
		return {
			outbound: async () => ({
				type: "Video",
				body: {
					mediaId: await upload(),
					looping: false,
					maxViews: REPLAYABLE_MAX_VIEWS,
				},
			}),
			optimistic: {
				type: "Video",
				body: {
					mediaId: 0,
					url: "",
					contentType: "video/mp4",
					length: inspection.durationMs ?? 0,
					maxViews: REPLAYABLE_MAX_VIEWS,
					viewsRemaining: REPLAYABLE_MAX_VIEWS,
					looping: false,
				},
			},
		};
	}
	return {
		outbound: async () => ({
			type: "Image",
			body: { mediaId: await upload() },
		}),
		optimistic: {
			type: "Image",
			body: {
				mediaId: 0,
				url: preview?.dataUrl ?? "",
				width: preview?.width ?? null,
				height: preview?.height ?? null,
				imageHash: "",
				takenOnGrindr: false,
				createdAt: Date.now(),
			},
		},
	};
}
