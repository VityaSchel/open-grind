import { type MessageKey, t } from "$lib/i18n";
import type {
	ApiResponseMessage,
	QuotedMessage,
} from "$lib/model/messaging/messages";

export type MessagePreview = {
	type: string;
	text?: string | null;
	albumId?: number | null;
	imageHash?: string | null;
};

export function previewFromMessage(
	message: ApiResponseMessage | QuotedMessage | undefined,
): MessagePreview {
	if (!message)
		return { type: "", text: null, albumId: null, imageHash: null };
	switch (message.type) {
		case "Unsent":
			return {
				type: "Unsent",
				text: null,
				albumId: null,
				imageHash: null,
			};
		case "Text":
			return {
				type: "Text",
				text: message.body.text,
				albumId: null,
				imageHash: null,
			};
		case "Image":
			return {
				type: "Image",
				text: null,
				albumId: null,
				imageHash: message.body.imageHash,
			};
		case "Album":
		case "ExpiringAlbum":
		case "ExpiringAlbumV2":
			return {
				type: message.type,
				text: null,
				albumId: message.body.albumId,
				imageHash: null,
			};
		case "ExpiringImage":
		default:
			return {
				type: message.type,
				text: null,
				albumId: null,
				imageHash: null,
			};
	}
}

const EXPIRING_VIDEO_TYPES = new Set(["Video", "PrivateVideo"]);

const previewTypeKeys = {
	album: "chat.messagePreview.album",
	expiringImage: "chat.messagePreview.expiringImage",
	expiringVideo: "chat.messagePreview.expiringVideo",
	photo: "chat.messagePreview.photo",
	unsent: "chat.messagePreview.unsent",
	voiceMessage: "chat.messagePreview.voiceMessage",
	video: "chat.messagePreview.video",
	videoCall: "chat.messagePreview.videoCall",
	gaymoji: "chat.messagePreview.gaymoji",
	gif: "chat.messagePreview.gif",
	location: "chat.messagePreview.location",
	profile: "chat.messagePreview.profile",
	rightNow: "chat.messagePreview.rightNow",
	message: "chat.messagePreview.message",
} as const satisfies Record<string, MessageKey>;

type PreviewType = keyof typeof previewTypeKeys;

type PreviewContent =
	| { readonly kind: "text"; readonly text: string }
	| { readonly kind: "type"; readonly type: PreviewType };

const quoteTypes: Partial<Record<string, PreviewType>> = {
	Unsent: "unsent",
	Audio: "voiceMessage",
	NonExpiringVideo: "video",
	VideoCall: "videoCall",
	Gaymoji: "gaymoji",
	Giphy: "gif",
	Location: "location",
	ProfileLink: "profile",
	ProfilePhotoReply: "photo",
	AlbumContentReaction: "album",
	AlbumContentReply: "album",
	RightNowRequest: "rightNow",
};

function mediaType(preview: MessagePreview): PreviewType | null {
	if ((preview.albumId ?? null) !== null) return "album";
	if (preview.type === "ExpiringImage") return "expiringImage";
	if (EXPIRING_VIDEO_TYPES.has(preview.type)) return "expiringVideo";
	if ((preview.imageHash ?? null) !== null || preview.type === "Image") {
		return "photo";
	}
	return null;
}

function previewContent(
	preview: MessagePreview | null | undefined,
): PreviewContent | null {
	if (preview === null || preview === undefined) return null;
	const text = preview.text ?? null;
	if (text !== null) return { kind: "text", text };
	const type = mediaType(preview);
	return type === null ? null : { kind: "type", type };
}

// Unlike previewContent, a quote always needs something to render — the inbox
// and the toast deliberately render its null, a quote pill cannot.
function quoteContent(preview: MessagePreview): PreviewContent {
	const content = previewContent(preview);
	if (content?.kind === "type") return content;
	if (content !== null && content.text.trim() !== "") return content;
	return { kind: "type", type: quoteTypes[preview.type] ?? "message" };
}

function previewContentLabel(content: PreviewContent): string {
	return content.kind === "text"
		? content.text
		: t(previewTypeKeys[content.type]);
}

export function previewLabel(
	preview: MessagePreview | null | undefined,
): string | null {
	const content = previewContent(preview);
	return content === null ? null : previewContentLabel(content);
}

export function quoteLabel(preview: MessagePreview): string {
	return previewContentLabel(quoteContent(preview));
}

export function previewIsUserText(
	preview: MessagePreview | null | undefined,
): boolean {
	return previewContent(preview)?.kind === "text";
}

export function quoteIsUserText(preview: MessagePreview): boolean {
	return quoteContent(preview).kind === "text";
}
