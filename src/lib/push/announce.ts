import { type PlainMessageKey, t } from "$lib/i18n";
import { isDesktopPlatform } from "$lib/platform/os";
import type { ApiResponseMessage } from "$lib/model/messaging/messages";
import { conversationDeeplink, TAPS_DEEPLINK } from "./deeplink";
import { notify } from "./index";
import { type Announcement, TAP_TAG_PREFIX } from "./types";

const MESSAGE_BODIES: Partial<
	Record<ApiResponseMessage["type"], PlainMessageKey>
> = {
	Image: "chat.notification.picture",
	ProfilePhotoReply: "chat.notification.picture",
	ExpiringImage: "chat.notification.expiringImage",
	Album: "chat.notification.album",
	ExpiringAlbum: "chat.notification.album",
	ExpiringAlbumV2: "chat.notification.album",
	AlbumContentReply: "chat.notification.album",
	AlbumContentReaction: "chat.notification.albumReaction",
	Audio: "chat.notification.audio",
	Video: "chat.notification.video",
	PrivateVideo: "chat.notification.video",
	NonExpiringVideo: "chat.notification.video",
	Gaymoji: "chat.notification.gaymoji",
	Giphy: "chat.notification.gif",
	Location: "chat.notification.location",
};

function typedText(message: ApiResponseMessage): string {
	switch (message.type) {
		case "Text":
			return message.body.text;
		case "AlbumContentReply":
			return message.body.albumContentReply;
		case "ProfilePhotoReply":
			return message.body.photoContentReply;
		default:
			return "";
	}
}

function announce(announcement: Announcement): void {
	if (!isDesktopPlatform()) return;
	notify(announcement).catch((error: unknown) => {
		console.error("Failed to show the notification", error);
	});
}

export function announceMessage({
	message,
	sender,
}: {
	message: ApiResponseMessage;
	sender: string;
}): void {
	announce({
		category: "messages",
		tag: message.conversationId,
		messageId: message.messageId,
		title: sender || t("common.someone"),
		body:
			typedText(message) ||
			t(MESSAGE_BODIES[message.type] ?? "chat.notification.message"),
		deeplink: conversationDeeplink(message.conversationId),
	});
}

export function announceTap({
	senderId,
	senderName,
}: {
	senderId: number;
	senderName: string | null;
}): void {
	announce({
		category: "taps",
		tag: `${TAP_TAG_PREFIX}${senderId}`,
		messageId: null,
		title: senderName || t("common.someone"),
		body: t("interest.taps.notification"),
		deeplink: TAPS_DEEPLINK,
	});
}
