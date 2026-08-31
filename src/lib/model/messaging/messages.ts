import z from "zod";

import {
	mediaHashPrivateSchema,
	mediaHashPublicSchema,
	mediaUrlSchema,
} from "$lib/model/media";
import {
	albumExpirationSchema,
	albumPreviewSchema,
} from "$lib/model/messaging/albums";
import { serverDefault } from "$lib/model/tolerance";
import { unixTimestampMsSchema, unmodeledSchema } from "$lib/model/types";

const messageBaseSchema = z.object({ type: z.string(), body: unmodeledSchema });

const messageOverlayBaseSchema = z.object({
	messageId: z.string(),
	conversationId: z.string(),
	senderId: z.int().nonnegative(),
	timestamp: unixTimestampMsSchema,
	unsent: serverDefault({ value: z.boolean(), fallback: false }),
	reactions: serverDefault({
		value: z.array(
			z.object({
				profileId: z.int().nonnegative(),
				reactionType: z.int().nonnegative(),
			}),
		),
		fallback: [],
	}),
	dynamic: unmodeledSchema,
	chat1Type: unmodeledSchema,
	replyPreview: unmodeledSchema,
});

export const albumMessageSchema = messageBaseSchema.safeExtend({
	type: z.literal("Album"),
	body: z.object({
		...albumPreviewSchema.shape,
		...albumExpirationSchema.shape,
		coverUrl: mediaUrlSchema.nullable(),
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
	body: z.object({ ...albumMessageSchema.shape.body.shape }),
});

export type ExpiringAlbumMessage = z.infer<typeof expiringAlbumMessageSchema>;

export const expiringAlbumV2MessageSchema = albumMessageSchema.extend({
	type: z.literal("ExpiringAlbumV2"),
	body: z.object({ ...albumMessageSchema.shape.body.shape }),
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
		previewUrl: mediaUrlSchema.nullable(),
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
		url: mediaUrlSchema,
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
		url: mediaUrlSchema.nullable(),
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
	body: unmodeledSchema,
});

export type NonExpiringVideoMessage = z.infer<
	typeof nonExpiringVideoMessageSchema
>;

export const gaymojiMessageSchema = messageBaseSchema.safeExtend({
	type: z.literal("Gaymoji"),
	body: z.object({ imageHash: z.string() }),
});

export type GaymojiMessage = z.infer<typeof gaymojiMessageSchema>;

export const generativeMessageSchema = messageBaseSchema.safeExtend({
	type: z.literal("Generative"),
	body: unmodeledSchema,
});

export type GenerativeMessage = z.infer<typeof generativeMessageSchema>;

export const giphyMessageSchema = messageBaseSchema.safeExtend({
	type: z.literal("Giphy"),
	body: z.object({
		id: z.string(),
		urlPath: mediaUrlSchema,
		stillPath: mediaUrlSchema,
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
		url: mediaUrlSchema,
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
		url: mediaUrlSchema.nullable(),
		viewsRemaining: z.int().nonnegative().nullable().optional(),
		duration: z.int().optional(),
		expiresAt: unixTimestampMsSchema.nullable().optional(),
		viewed: z.boolean().nullable().optional(),
	}),
});

export type ExpiringImageMessage = z.infer<typeof expiringImageMessageSchema>;

export const locationMessageSchema = messageBaseSchema.safeExtend({
	type: z.literal("Location"),
	body: z.object({ lat: z.number(), lon: z.number() }),
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
	body: unmodeledSchema,
});

export type ProfileLinkMessage = z.infer<typeof profileLinkMessageSchema>;

export const profilePhotoReplyMessageSchema = messageBaseSchema.safeExtend({
	type: z.literal("ProfilePhotoReply"),
	body: z.object({ imageHash: z.string(), photoContentReply: z.string() }),
});

export type ProfilePhotoReplyMessage = z.infer<
	typeof profilePhotoReplyMessageSchema
>;

export const retractMessageSchema = messageBaseSchema.safeExtend({
	type: z.literal("Retract"),
	body: z.object({ targetMessageId: z.string() }),
});

export type RetractMessage = z.infer<typeof retractMessageSchema>;

export const rightNowRequestMediaSchema = z.object({
	mediaHash: z.string(),
	isNsfw: z.boolean(),
});

export const rightNowRequestMessageSchema = messageBaseSchema.safeExtend({
	type: z.literal("RightNowRequest"),
	body: z.object({
		requestId: z.int().nonnegative(),
		requestCreatedAt: unixTimestampMsSchema,
		requestUpdatedAt: unixTimestampMsSchema,
		postStatus: z.string().nullable(),
		postId: z.int().nonnegative().nullable(),
		medias: z.array(rightNowRequestMediaSchema),
	}),
});

export type RightNowRequestMessage = z.infer<
	typeof rightNowRequestMessageSchema
>;

export const textMessageSchema = messageBaseSchema.safeExtend({
	type: z.literal("Text"),
	body: z.object({ text: z.string() }),
});

export type TextMessage = z.infer<typeof textMessageSchema>;

export const unknownMessageSchema = messageBaseSchema.safeExtend({
	type: z.literal("Unknown"),
	body: unmodeledSchema,
});

export type UnknownMessage = z.infer<typeof unknownMessageSchema>;

export const videoCallMessageSchema = messageBaseSchema.safeExtend({
	type: z.literal("VideoCall"),
	body: unmodeledSchema,
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
	rightNowRequestMessageSchema,
	textMessageSchema,
	unknownMessageSchema,
	nonExpiringVideoMessageSchema,
	videoCallMessageSchema,
	videoMessageSchema,
]);

const modeledMessageTypes = new Set<string>(
	messageSchema.options.map((option) => option.shape.type.value),
);
const typesAlreadyReportedAsDrifted = new Set<string>();

function warnOnceIfModeledTypeDriftedFromSpec(type: string): void {
	const isDrift = modeledMessageTypes.has(type);
	if (!isDrift || typesAlreadyReportedAsDrifted.has(type)) return;
	typesAlreadyReportedAsDrifted.add(type);
	console.warn(
		`[messages] "${type}" no longer matches the body documented in docs/lib/openapi.json and is rendering as Unknown`,
	);
}

function messageBranchesWithOverlay<Overlay extends z.ZodObject>({
	overlay,
}: {
	overlay: Overlay;
}) {
	const unsent = z.intersection(
		messageBaseSchema.safeExtend({
			type: z.string().transform((): "Unsent" => "Unsent"),
			unsent: z.literal(true),
			body: z.null(),
		}),
		overlay,
	);
	const unrecognized = z
		.intersection(
			messageBaseSchema.safeExtend({
				type: z.string(),
				body: unmodeledSchema,
			}),
			overlay,
		)
		.transform(({ type, ...message }) => {
			warnOnceIfModeledTypeDriftedFromSpec(type);
			return {
				...message,
				type: "Unknown" as const,
				unrecognizedType: type,
			};
		});
	return {
		unsent,
		unrecognized,
		all: z.intersection(messageSchema, overlay).or(unsent).or(unrecognized),
	};
}

// One level deep by design: a recursive quote makes parse cost grow with
// nesting depth. The relaxed fields are the ones a trimmed quote omits.
const quotedMessageOverlaySchema = messageOverlayBaseSchema
	.partial({
		conversationId: true,
		timestamp: true,
		unsent: true,
		reactions: true,
	})
	.safeExtend({ replyToMessage: unmodeledSchema });

export const quotedMessageSchema = messageBranchesWithOverlay({
	overlay: quotedMessageOverlaySchema,
}).all;

export type QuotedMessage = z.infer<typeof quotedMessageSchema>;

let unmodelableQuoteReported = false;

export const apiResponseMessageOverlaySchema =
	messageOverlayBaseSchema.safeExtend({
		// A quote we cannot model must never cost us the message carrying it.
		replyToMessage: quotedMessageSchema.nullish().catch(({ error }) => {
			if (!unmodelableQuoteReported) {
				unmodelableQuoteReported = true;
				console.warn(
					"[messages] a quoted reply did not match the modeled shape and was dropped",
					error,
				);
			}
			return null;
		}),
	});

const apiResponseMessageBranches = messageBranchesWithOverlay({
	overlay: apiResponseMessageOverlaySchema,
});

export const unsentMessageSchema = apiResponseMessageBranches.unsent;
export type UnsentMessage = z.infer<typeof unsentMessageSchema>;

export const unrecognizedMessageSchema =
	apiResponseMessageBranches.unrecognized;
export type UnrecognizedMessage = z.infer<typeof unrecognizedMessageSchema>;

export const apiResponseMessageSchema = apiResponseMessageBranches.all;

export type Message = z.infer<typeof messageSchema>;
export type ApiResponseMessage = z.infer<typeof apiResponseMessageSchema>;

const mediaIdSchema = z.int().nonnegative();

export const outboundMessageSchema = z.discriminatedUnion("type", [
	z.object({ type: z.literal("Text"), body: textMessageSchema.shape.body }),
	z.object({
		type: z.literal("Location"),
		body: locationMessageSchema.shape.body,
	}),
	z.object({
		type: z.literal("Gaymoji"),
		body: gaymojiMessageSchema.shape.body,
	}),
	z.object({ type: z.literal("Giphy"), body: giphyMessageSchema.shape.body }),
	z.object({
		type: z.literal("ProfilePhotoReply"),
		body: profilePhotoReplyMessageSchema.shape.body,
	}),
	z.object({
		type: z.literal("Image"),
		body: z.object({ mediaId: mediaIdSchema }),
	}),
	z.object({
		type: z.literal("ExpiringImage"),
		body: z.object({ mediaId: mediaIdSchema, expiring: z.literal(true) }),
	}),
	z.object({
		type: z.literal("Audio"),
		body: z.object({ mediaId: mediaIdSchema }),
	}),
	z.object({
		type: z.literal("Video"),
		body: z.object({
			mediaId: mediaIdSchema,
			looping: z.boolean(),
			maxViews: z.int().nonnegative(),
		}),
	}),
	z.object({
		type: z.literal("AlbumContentReaction"),
		body: z.object({
			albumId: z.int().nonnegative(),
			albumContentId: z.int().nonnegative(),
		}),
	}),
	z.object({
		type: z.literal("AlbumContentReply"),
		body: z.object({
			albumId: z.int().nonnegative(),
			albumContentId: z.int().nonnegative(),
			albumContentReply: z.string(),
		}),
	}),
]);

export type OutboundMessage = z.infer<typeof outboundMessageSchema>;

export type MessageDraft = { outbound: OutboundMessage; optimistic: Message };

type SharedShapeMessage = Extract<
	Message,
	{ type: "Text" | "Location" | "Gaymoji" | "Giphy" | "ProfilePhotoReply" }
>;

export function draftFromMessage(message: SharedShapeMessage): MessageDraft {
	return { outbound: message, optimistic: message };
}
