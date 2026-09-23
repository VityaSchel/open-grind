import {
	type MessageDraft,
	REPLAYABLE_MAX_VIEWS,
	VIEW_ONCE_MAX_VIEWS,
} from "$lib/model/messaging/messages";
import { mediaFileKindOf } from "$lib/platform/media-file";
import type { DrawerMedia } from "$lib/api/messaging/drawer";

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
