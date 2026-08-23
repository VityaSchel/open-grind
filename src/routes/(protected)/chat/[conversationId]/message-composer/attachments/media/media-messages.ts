import type { DrawerMedia } from "$lib/api/messaging/drawer";
import type { MessageDraft } from "$lib/model/messaging/messages";

function imageHashFromUrl(url: string): string {
	return /([0-9a-f]{64}|[0-9a-f]{40})/i.exec(url)?.[1] ?? "";
}

export function mediaMessageDraft({
	item,
	expiring,
}: {
	item: DrawerMedia;
	expiring: boolean;
}): MessageDraft {
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
