import z from "zod";

import { albumExpirationSchema, albumPreviewSchema } from "$lib/model/album";
import {
	mediaHashPrivateSchema,
	mediaHashPublicSchema,
} from "$lib/model/media";
import { unixTimestampMsSchema } from "$lib/model/types";

const messageBaseSchema = z.object({
	type: z.string(),
	body: z.unknown(),
});

export const apiResponseMessageOverlaySchema = z.object({
	messageId: z.string(),
	conversationId: z.string(),
	senderId: z.int().nonnegative(),
	timestamp: unixTimestampMsSchema,
	unsent: z.boolean(),
	reactions: z.array(
		z.object({
			profileId: z.int().nonnegative(),
			reactionType: z.int().nonnegative(),
		}),
	),
	// replyToMessage: z.unknown().nullable(),
	// dynamic: z.boolean(),
	// chat1Type: z.string(),
	// replyPreview: z.unknown().nullable(),
});

export const albumMessageSchema = messageBaseSchema.safeExtend({
	type: z.literal("Album"),
	body: z.object({
		...albumPreviewSchema.shape,
		...albumExpirationSchema.shape,
		coverUrl: z.url().nullable(),
		ownerProfileId: z.int().nonnegative().nullable(),
		isViewable: z.boolean(),
		hasVideo: z.boolean(),
		hasPhoto: z.boolean(),
		viewableUntil: unixTimestampMsSchema.nullable().optional(),
	}),
});

export type AlbumMessage = z.infer<typeof albumMessageSchema>;

export const expiringAlbumMessageSchema = albumMessageSchema.extend({
	type: z.literal("ExpiringAlbum"),
	body: z.object({
		...albumMessageSchema.shape.body.shape,
	}),
});

export type ExpiringAlbumMessage = z.infer<typeof expiringAlbumMessageSchema>;

export const expiringAlbumV2MessageSchema = albumMessageSchema.extend({
	type: z.literal("ExpiringAlbumV2"),
	body: z.object({
		...albumMessageSchema.shape.body.shape,
	}),
});

export type ExpiringAlbumV2Message = z.infer<
	typeof expiringAlbumV2MessageSchema
>;

export const albumContentReactionMessageSchema = messageBaseSchema.safeExtend({
	type: z.literal("AlbumContentReaction"),
	body: z.object({
		albumId: z.int().nonnegative(),
		ownerProfileId: z.int().nonnegative().nullable(),
		albumContentId: z.int().nonnegative(),
		previewUrl: z.url().nullable(),
		expiresAt: unixTimestampMsSchema.nullable(),
		viewable: z.boolean(),
	}),
});

export type AlbumContentReactionMessage = z.infer<
	typeof albumContentReactionMessageSchema
>;

export const albumContentReplyMessageSchema = messageBaseSchema.safeExtend({
	type: z.literal("AlbumContentReply"),
	body: z.object({
		...albumContentReactionMessageSchema.shape.body.shape,
		albumContentReply: z.string(),
		contentType: z.string().nullable(),
	}),
});

export type AlbumContentReplyMessage = z.infer<
	typeof albumContentReplyMessageSchema
>;

export const audioMessageSchema = messageBaseSchema.safeExtend({
	type: z.literal("Audio"),
	body: z.object({
		mediaId: z.int().nonnegative(),
		mediaHash: mediaHashPrivateSchema.nullable(),
		url: z.url(),
		contentType: z.string().nullable(),
		length: z.int().nonnegative().nullable(),
		expiresAt: unixTimestampMsSchema.nullable(),
	}),
});

export type AudioMessage = z.infer<typeof audioMessageSchema>;

export const videoMessageSchema = messageBaseSchema.safeExtend({
	type: z.literal("Video"),
	body: z.object({
		mediaId: z.int().nonnegative().nullable(),
		url: z.url().nullable(),
		fileCacheKey: z.string().optional(),
		contentType: z.string().nullable(),
		length: z.int().nonnegative(),
		maxViews: z.int().nonnegative().nullable(),
		looping: z.boolean().nullable(),
		viewsRemaining: z.int().nonnegative().optional(),
	}),
});

export type VideoMessage = z.infer<typeof videoMessageSchema>;

export const nonExpiringVideoMessageSchema = messageBaseSchema.safeExtend({
	type: z.literal("NonExpiringVideo"),
	body: z.unknown(),
});

export type NonExpiringVideoMessage = z.infer<
	typeof nonExpiringVideoMessageSchema
>;

export const gaymojiMessageSchema = messageBaseSchema.safeExtend({
	type: z.literal("Gaymoji"),
	body: z.object({
		imageHash: z.string(),
	}),
});

export type GaymojiMessage = z.infer<typeof gaymojiMessageSchema>;

export const generativeMessageSchema = messageBaseSchema.safeExtend({
	type: z.literal("Generative"),
	body: z.unknown(),
});

export type GenerativeMessage = z.infer<typeof generativeMessageSchema>;

export const giphyMessageSchema = messageBaseSchema.safeExtend({
	type: z.literal("Giphy"),
	body: z.object({
		id: z.string(),
		urlPath: z.url(),
		stillPath: z.url(),
		previewPath: z.string(),
		width: z.int().nonnegative(),
		height: z.int().nonnegative(),
		imageHash: z.string(),
	}),
});

export type GiphyMessage = z.infer<typeof giphyMessageSchema>;

const imageBaseMessageSchema = messageBaseSchema.safeExtend({
	body: z.object({
		mediaId: z.int().nonnegative(),
		width: z.int().nonnegative().nullable(),
		height: z.int().nonnegative().nullable(),
	}),
});

export const imageMessageSchema = imageBaseMessageSchema.safeExtend({
	type: z.literal("Image"),
	body: z.object({
		...imageBaseMessageSchema.shape.body.shape,
		url: z.url(),
		imageHash: z.union([mediaHashPrivateSchema, mediaHashPublicSchema]),
		takenOnGrindr: z.boolean(),
		createdAt: unixTimestampMsSchema.nullable(),
	}),
});

export type ImageMessage = z.infer<typeof imageMessageSchema>;

export const expiringImageMessageSchema = imageBaseMessageSchema.safeExtend({
	type: z.literal("ExpiringImage"),
	body: z.object({
		...imageBaseMessageSchema.shape.body.shape,
		url: z.url().nullable(),
		viewsRemaining: z.int().nonnegative().nullable(),
	}),
});

export type ExpiringImageMessage = z.infer<typeof expiringImageMessageSchema>;

export const locationMessageSchema = messageBaseSchema.safeExtend({
	type: z.literal("Location"),
	body: z.object({
		lat: z.number(),
		lon: z.number(),
	}),
});

export type LocationMessage = z.infer<typeof locationMessageSchema>;

export const privateVideoMessageSchema = messageBaseSchema.safeExtend({
	type: z.literal("PrivateVideo"),
	body: z.object({
		...videoMessageSchema.shape.body.shape,
		viewCount: z.int().nonnegative().nullable(),
	}),
});

export type PrivateVideoMessage = z.infer<typeof privateVideoMessageSchema>;

export const profileLinkMessageSchema = messageBaseSchema.safeExtend({
	type: z.literal("ProfileLink"),
	body: z.unknown(),
});

export type ProfileLinkMessage = z.infer<typeof profileLinkMessageSchema>;

export const profilePhotoReplyMessageSchema = messageBaseSchema.safeExtend({
	type: z.literal("ProfilePhotoReply"),
	body: z.object({
		imageHash: z.string(),
		photoContentReply: z.string(),
	}),
});

export type ProfilePhotoReplyMessage = z.infer<
	typeof profilePhotoReplyMessageSchema
>;

export const retractMessageSchema = messageBaseSchema.safeExtend({
	type: z.literal("Retract"),
	body: z.object({
		targetMessageId: z.string(),
	}),
});

export type RetractMessage = z.infer<typeof retractMessageSchema>;

export const textMessageSchema = messageBaseSchema.safeExtend({
	type: z.literal("Text"),
	body: z.object({
		text: z.string(),
	}),
});

export type TextMessage = z.infer<typeof textMessageSchema>;

export const unknownMessageSchema = messageBaseSchema.safeExtend({
	type: z.literal("Unknown"),
	body: z.unknown(),
});

export type UnknownMessage = z.infer<typeof unknownMessageSchema>;

export const videoCallMessageSchema = messageBaseSchema.safeExtend({
	type: z.literal("VideoCall"),
	body: z.unknown(),
});

export type VideoCallMessage = z.infer<typeof videoCallMessageSchema>;

export const messageSchema = z.discriminatedUnion("type", [
	albumMessageSchema,
	albumContentReactionMessageSchema,
	albumContentReplyMessageSchema,
	audioMessageSchema,
	expiringAlbumMessageSchema,
	expiringAlbumV2MessageSchema,
	expiringImageMessageSchema,
	gaymojiMessageSchema,
	generativeMessageSchema,
	giphyMessageSchema,
	imageMessageSchema,
	locationMessageSchema,
	privateVideoMessageSchema,
	profileLinkMessageSchema,
	profilePhotoReplyMessageSchema,
	retractMessageSchema,
	textMessageSchema,
	unknownMessageSchema,
	nonExpiringVideoMessageSchema,
	videoCallMessageSchema,
	videoMessageSchema,
]);

export const unsentMessageSchema = z.intersection(
	messageBaseSchema.safeExtend({
		type: z.string().transform((): "Unsent" => "Unsent"),
		unsent: z.literal(true),
		body: z.null(),
	}),
	apiResponseMessageOverlaySchema,
);

export type UnsentMessage = z.infer<typeof unsentMessageSchema>;

export const apiResponseMessageSchema = z
	.intersection(messageSchema, apiResponseMessageOverlaySchema)
	.or(unsentMessageSchema);

export type Message = z.infer<typeof messageSchema>;
export type ApiResponseMessage = z.infer<typeof apiResponseMessageSchema>;

export type MessagePreview = {
	type: string;
	text: string | null;
	albumId: number | null;
	imageHash: string | null;
};

export function previewFromMessage(
	message: ApiResponseMessage | undefined,
): MessagePreview {
	if (!message) return { type: "", text: null, albumId: null, imageHash: null };
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

export function previewLabel(preview: MessagePreview | null): string | null {
	if (preview === null) return null;
	if (preview.text !== null) return preview.text;
	if (preview.albumId !== null) return "Album";
	if (preview.imageHash !== null || preview.type === "Image") return "Photo";
	return null;
}
