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

export function previewLabel(
	preview: MessagePreview | null | undefined,
): string | null {
	if (preview === null || preview === undefined) return null;
	const text = preview.text ?? null;
	if (text !== null) return text;
	if ((preview.albumId ?? null) !== null) return "Album";
	if (preview.type === "ExpiringImage") return "Expiring image";
	if (EXPIRING_VIDEO_TYPES.has(preview.type)) return "Expiring video";
	if ((preview.imageHash ?? null) !== null || preview.type === "Image") {
		return "Photo";
	}
	return null;
}

const QUOTE_LABELS: Record<string, string> = {
	Unsent: "Unsent message",
	Audio: "Voice message",
	NonExpiringVideo: "Video",
	VideoCall: "Video call",
	Gaymoji: "Gaymoji",
	Giphy: "GIF",
	Location: "Location",
	ProfileLink: "Profile",
	ProfilePhotoReply: "Photo",
	AlbumContentReaction: "Album",
	AlbumContentReply: "Album",
	RightNowRequest: "Right Now",
};

// Unlike previewLabel, a quote always needs something to render — the inbox
// and the toast deliberately render its null, a quote pill cannot.
export function quoteLabel(preview: MessagePreview): string {
	const label = previewLabel(preview);
	if (label !== null && label.trim() !== "") return label;
	return QUOTE_LABELS[preview.type] ?? "Message";
}
