import { registerAccountCache } from "$lib/api/account-caches";
import { conversationIdFor } from "$lib/chat/conversation-id";
import { previewFromMessage } from "$lib/model/messaging/message-preview";
import {
	type AlbumReplyTarget,
	type ApiResponseMessage,
	apiResponseMessageSchema,
	outboundMessageSchema,
} from "$lib/model/messaging/messages";
import type { InboxFilterRequest } from "$lib/api/messaging/conversations";
import type { AlbumExpirationType } from "$lib/model/messaging/albums";
import type { Conversation } from "$lib/model/messaging/conversations";
import { DAY, demoMeProfileId, MINUTE, NOW, SECOND } from "../config";
import { albumCoverUrl, demoAlbumContent, demoAlbumExists } from "./albums";
import { hashFromSeed, picsum } from "./avatars";
import { isTierGatedFilter, matchesInboxFilters } from "./conversation-filters";
import {
	type DemoConversation,
	demoConversationSeeds,
	type DemoMessage,
} from "./conversation-seeds";
import { demoDrawerMedia } from "./drawer";
import { demoFavoriteOf } from "./favorites";
import { demoGiphyMessageBody } from "./giphy";
import { lastOnlineOf, onlineUntilOf, photosOf, profileSeed } from "./profiles";

const MESSAGE_GAP = 7 * MINUTE;
const MESSAGES_PER_PAGE = 8;
const DEMO_IMAGE_URL = "https://picsum.photos/seed/opengrind-demo/600/800";
const EXPIRING_IMAGE_DURATION_MS = 10 * SECOND;

const demoConversationById = new Map(
	demoConversationSeeds.map((conv) => [
		conversationIdFor({
			profileId: conv.withId,
			ourProfileId: demoMeProfileId,
		}),
		conv,
	]),
);

const pinnedOverrides = new Map<string, boolean>();
const mutedOverrides = new Map<string, boolean>();
const deletedConversationIds = new Set<string>();
const sentProfilePhotoReplies = new Map<string, ApiResponseMessage[]>();
registerAccountCache({ reset: () => sentProfilePhotoReplies.clear() });

export function demoSetConversationPinned({
	conversationId,
	pinned,
}: {
	conversationId: string;
	pinned: boolean;
}): void {
	pinnedOverrides.set(conversationId, pinned);
}

export function demoSetConversationMuted({
	conversationId,
	muted,
}: {
	conversationId: string;
	muted: boolean;
}): void {
	mutedOverrides.set(conversationId, muted);
}

export function demoDeleteConversation(conversationId: string): void {
	deletedConversationIds.add(conversationId);
}

function lastActivityOf(conv: DemoConversation): number {
	return NOW - conv.lastActivityAgo * MINUTE;
}

function buildMessage({
	conv,
	message,
	index,
	timestamp,
}: {
	conv: DemoConversation;
	message: DemoMessage;
	index: number;
	timestamp: number;
}): ApiResponseMessage {
	const conversationId = conversationIdFor({
		profileId: conv.withId,
		ourProfileId: demoMeProfileId,
	});
	const messageId = `${index}:demo-${conv.withId}-${index}`;
	const senderId = message.fromMe ? demoMeProfileId : conv.withId;
	const reactions = Array.from({ length: message.reactions ?? 0 }, () => ({
		profileId: message.fromMe ? conv.withId : demoMeProfileId,
		reactionType: 1,
	}));
	const base = {
		messageId,
		conversationId,
		senderId,
		timestamp,
		reactions,
		dynamic: false,
	};
	switch (message.kind) {
		case "profilePhotoReply":
			return {
				type: "ProfilePhotoReply",
				body: {
					imageHash: photosOf(
						message.fromMe ? conv.withId : demoMeProfileId,
					)[0]!,
					photoContentReply: message.text,
				},
				...base,
				unsent: false,
			};
		case "image":
			return {
				type: "Image",
				body: {
					mediaId: 900_000 + conv.withId,
					width: 600,
					height: 800,
					url: DEMO_IMAGE_URL,
					imageHash: hashFromSeed(`msg-${conv.withId}-${index}`),
					takenOnGrindr: false,
					createdAt: timestamp,
				},
				...base,
				unsent: false,
			};
		case "expiringImage":
			return {
				type: "ExpiringImage",
				body: {
					mediaId: 910_000 + conv.withId + index,
					width: 600,
					height: 800,
					url: picsum({ seed: `expiring-${conv.withId}-${index}` }),
					duration: EXPIRING_IMAGE_DURATION_MS,
					viewsRemaining: message.expired ? 0 : 1,
					expiresAt: timestamp + DAY,
					viewed: message.expired,
				},
				...base,
				unsent: false,
			};
		case "album": {
			const { content } = demoAlbumContent(message.albumId);
			const albumHolds = (kind: "image" | "video") =>
				content.some((item) => item.contentType.startsWith(`${kind}/`));
			const albumBody = {
				albumId: message.albumId,
				hasUnseenContent: message.unseen ?? false,
				expiresAt: message.expiring ? timestamp + DAY : null,
				expirationType: (message.expiring
					? "ONCE"
					: "INDEFINITE") as AlbumExpirationType,
				coverUrl:
					message.coverUrl === null
						? null
						: message.locked
							? null
							: albumCoverUrl(message.albumId),
				ownerProfileId: message.fromMe ? demoMeProfileId : conv.withId,
				isViewable: !message.locked,
				hasVideo: albumHolds("video"),
				hasPhoto: albumHolds("image"),
				viewableUntil: message.expiring ? timestamp + DAY : null,
			};
			if (message.expiring === "v2")
				return {
					type: "ExpiringAlbumV2",
					body: albumBody,
					...base,
					unsent: false,
				};
			if (message.expiring === "v1")
				return {
					type: "ExpiringAlbum",
					body: albumBody,
					...base,
					unsent: false,
				};
			return { type: "Album", body: albumBody, ...base, unsent: false };
		}
		case "gif":
			return {
				type: "Giphy",
				body: demoGiphyMessageBody(`message-${conv.withId}-${index}`),
				...base,
				unsent: false,
			};
		case "albumReply":
			return {
				type: "AlbumContentReply",
				body: {
					albumContentReply: message.text,
					...albumContentBody({
						albumId: message.albumId,
						albumContentId: message.albumContentId,
						ownerProfileId: message.fromMe
							? conv.withId
							: demoMeProfileId,
						expiresAt: null,
						isViewable: true,
					}),
				},
				...base,
				unsent: false,
			};
		case "unsent":
			return { type: "Unsent", body: null, ...base, unsent: true };
		default:
			return {
				type: "Text",
				body: { text: message.text },
				...base,
				unsent: false,
			};
	}
}

function threadMessages(conv: DemoConversation): ApiResponseMessage[] {
	const lastActivity = lastActivityOf(conv);
	const count = conv.messages.length;
	const ordered = conv.messages.map((message, i) =>
		buildMessage({
			conv,
			message,
			index: i,
			timestamp: lastActivity - (count - 1 - i) * MESSAGE_GAP,
		}),
	);
	return [
		...(sentProfilePhotoReplies.get(
			conversationIdFor({
				profileId: conv.withId,
				ourProfileId: demoMeProfileId,
			}),
		) ?? []),
		...ordered.reverse(),
	];
}

const GATED_FULL_ENTRY_LIMIT = 2;

const emptyInbox = {
	entries: [],
	showsFreeHeaderLabel: false,
	totalFullConversations: 0,
	totalPartialConversations: 0,
	maxDisplayLockCount: 99,
	nextPage: null,
};

function partialEntry({ data }: Conversation) {
	return {
		type: "partial_conversation_v1" as const,
		data: {
			conversationId: data.conversationId,
			name: data.name,
			participants: data.participants,
			lastActivityTimestamp: data.lastActivityTimestamp,
			unreadCount: data.unreadCount,
			preview: data.preview,
		},
	};
}

export function demoConversations({
	page,
	filters = {},
}: {
	page: number;
	filters?: Partial<InboxFilterRequest>;
}) {
	if (page > 1) return emptyInbox;
	const entries: Conversation[] = demoConversationSeeds
		.filter(
			(conv) =>
				!deletedConversationIds.has(
					conversationIdFor({
						profileId: conv.withId,
						ourProfileId: demoMeProfileId,
					}),
				),
		)
		.map((conv): Conversation => {
			const conversationId = conversationIdFor({
				profileId: conv.withId,
				ourProfileId: demoMeProfileId,
			});
			const seed = profileSeed(conv.withId);
			const photos = photosOf(conv.withId);
			const latest = threadMessages(conv).at(0);
			return {
				type: "full_conversation_v1",
				data: {
					conversationId,
					name: seed.name ?? "Grindr user",
					participants: [
						{
							profileId: conv.withId,
							primaryMediaHash: photos[0] ?? null,
							lastOnline: lastOnlineOf(seed),
							onlineUntil: onlineUntilOf(seed),
							distanceMetres: seed.distanceM,
							position: seed.position,
							isInAList: demoFavoriteOf({
								profileId: conv.withId,
								seed: conv.favorite,
							}),
							hasDatingPotential: conv.chemistry ?? false,
						},
					],
					lastActivityTimestamp: lastActivityOf(conv),
					unreadCount: conv.unread,
					preview: previewFromMessage(latest),
					muted: mutedOverrides.get(conversationId) ?? conv.muted,
					pinned: pinnedOverrides.get(conversationId) ?? conv.pinned,
					favorite: demoFavoriteOf({
						profileId: conv.withId,
						seed: conv.favorite,
					}),
					rightNow: conv.rightNow ?? "NOT_ACTIVE",
					onlineUntil: onlineUntilOf(seed),
					hasUnreadThrob: false,
				},
			};
		})
		.filter((entry) => matchesInboxFilters({ entry, filters }))
		.sort(
			(a, b) =>
				b.data.lastActivityTimestamp - a.data.lastActivityTimestamp,
		);
	const gatedFrom = isTierGatedFilter(filters)
		? GATED_FULL_ENTRY_LIMIT
		: entries.length;
	return {
		entries: entries.map((entry, index) =>
			index < gatedFrom ? entry : partialEntry(entry),
		),
		showsFreeHeaderLabel: gatedFrom < entries.length,
		totalFullConversations: Math.min(gatedFrom, entries.length),
		totalPartialConversations: Math.max(entries.length - gatedFrom, 0),
		maxDisplayLockCount: 99,
		nextPage: null,
	};
}

export function demoConversationMessages({
	conversationId,
	pageKey,
}: {
	conversationId: string;
	pageKey?: string;
}) {
	const conv = demoConversationById.get(conversationId);
	const seed = conv ? profileSeed(conv.withId) : undefined;
	const photos = conv ? photosOf(conv.withId) : [];
	const profile = {
		distance: seed?.distanceM ?? null,
		mediaHash: photos[0] ?? null,
		name: seed?.name ?? null,
		onlineUntil: seed ? onlineUntilOf(seed) : null,
		profileId: conv?.withId ?? 0,
		showDistance: seed?.distanceM !== null && seed?.distanceM !== undefined,
	};
	if (!conv) return { lastReadTimestamp: null, messages: [], profile };
	const thread = threadMessages(conv);
	if (pageKey === undefined) {
		const lastReadTimestamp =
			conv.unread > 0 ? (thread[conv.unread]?.timestamp ?? null) : NOW;
		return {
			lastReadTimestamp,
			messages: thread.slice(0, MESSAGES_PER_PAGE),
			profile,
		};
	}
	const after = thread.findIndex((message) => message.messageId === pageKey);
	if (after === -1) return { lastReadTimestamp: null, messages: [], profile };
	return {
		lastReadTimestamp: null,
		messages: thread.slice(after + 1, after + 1 + MESSAGES_PER_PAGE),
		profile,
	};
}

export function demoSingleMessage({
	conversationId,
	messageId,
}: {
	conversationId: string;
	messageId: string;
}) {
	const conv = demoConversationById.get(conversationId);
	const message = conv
		? threadMessages(conv).find((entry) => entry.messageId === messageId)
		: undefined;
	return { message: message ?? null };
}

export function demoMessagesById({
	conversationId,
	messageIds,
}: {
	conversationId: string;
	messageIds: string[];
}) {
	const conv = demoConversationById.get(conversationId);
	const wanted = new Set(messageIds);
	return {
		messages: conv
			? threadMessages(conv).filter((entry) =>
					wanted.has(entry.messageId),
				)
			: [],
	};
}

let demoSentCounter = 0;

function albumContentBody({
	albumId,
	albumContentId,
	ownerProfileId,
	expiresAt,
	isViewable,
}: {
	albumId: number;
	albumContentId: number;
	ownerProfileId: number | null;
	expiresAt: number | null;
	isViewable: boolean;
}): AlbumReplyTarget {
	const content = demoAlbumContent(albumId).content.find(
		(item) => item.contentId === albumContentId,
	);
	const viewable = Boolean(
		isViewable &&
		demoAlbumExists(albumId) &&
		(expiresAt === null || expiresAt > Date.now()) &&
		content?.url &&
		!content.processing,
	);
	return {
		albumId,
		albumContentId,
		ownerProfileId,
		expiresAt,
		viewable,
		previewUrl: viewable ? (content?.thumbUrl ?? null) : null,
		contentType: content?.contentType ?? null,
	};
}

export function demoSentMessage(body: unknown): ApiResponseMessage {
	const sent = body as {
		type?: string;
		target?: { targetId?: number };
		body?: unknown;
		replyToMessageId?: string;
	};
	const targetId = sent.target?.targetId ?? 0;
	const timestamp = NOW;
	const conversationId = conversationIdFor({
		profileId: targetId,
		ourProfileId: demoMeProfileId,
	});
	const overlay = {
		messageId: `${timestamp}:demo-sent-${targetId}-${demoSentCounter++}`,
		conversationId,
		senderId: demoMeProfileId,
		timestamp,
		unsent: false,
		reactions: [],
		dynamic: false,
		replyToMessage:
			sent.replyToMessageId === undefined
				? null
				: demoSingleMessage({
						conversationId,
						messageId: sent.replyToMessageId,
					}).message,
	};
	if (
		sent.type === "AlbumContentReaction" ||
		sent.type === "AlbumContentReply"
	) {
		const message = outboundMessageSchema.parse(sent);
		if (
			message.type !== "AlbumContentReaction" &&
			message.type !== "AlbumContentReply"
		)
			throw new Error("Invalid album message");
		const conv = demoConversationById.get(conversationId);
		const album = (conv ? threadMessages(conv) : [])
			.filter(
				(message) =>
					message.type === "Album" ||
					message.type === "ExpiringAlbum" ||
					message.type === "ExpiringAlbumV2",
			)
			.find(({ body }) => body.albumId === message.body.albumId)?.body;
		return apiResponseMessageSchema.parse({
			...overlay,
			type: message.type,
			body: {
				...message.body,
				...albumContentBody({
					...message.body,
					ownerProfileId: album?.ownerProfileId ?? null,
					expiresAt: album?.expiresAt ?? null,
					isViewable: album?.isViewable ?? false,
				}),
			},
		});
	}
	const mediaId =
		sent.body && typeof sent.body === "object"
			? (sent.body as { mediaId?: number }).mediaId
			: undefined;
	if (sent.type === "ProfilePhotoReply") {
		const reply = apiResponseMessageSchema.parse({
			...outboundMessageSchema.parse(sent),
			...overlay,
		});
		const replies = sentProfilePhotoReplies.get(conversationId) ?? [];
		replies.unshift(reply);
		sentProfilePhotoReplies.set(conversationId, replies);
		return reply;
	}
	if (
		mediaId !== undefined &&
		(sent.type === "Image" || sent.type === "ExpiringImage")
	) {
		const item = demoDrawerMedia().find((media) => media.id === mediaId);
		const url = item?.url ?? DEMO_IMAGE_URL;
		if (sent.type === "ExpiringImage") {
			return {
				type: "ExpiringImage",
				body: {
					mediaId,
					width: null,
					height: null,
					url,
					duration: EXPIRING_IMAGE_DURATION_MS,
					viewsRemaining: 1,
					expiresAt: timestamp + DAY,
					viewed: false,
				},
				...overlay,
			};
		}
		return {
			type: "Image",
			body: {
				mediaId,
				width: null,
				height: null,
				url,
				imageHash: hashFromSeed(`drawer-${mediaId}`),
				takenOnGrindr: item?.takenOnGrindr ?? false,
				createdAt: item?.createdTs ?? timestamp,
			},
			...overlay,
		};
	}
	const attachment = outboundMessageSchema.safeParse({
		type: sent.type,
		body: sent.body,
	});
	if (
		attachment.success &&
		(attachment.data.type === "Giphy" ||
			attachment.data.type === "Gaymoji" ||
			attachment.data.type === "Location")
	) {
		return { ...attachment.data, ...overlay };
	}
	return {
		type: "Text",
		body:
			sent.type === "Text" && sent.body && typeof sent.body === "object"
				? (sent.body as { text: string })
				: { text: "" },
		...overlay,
	};
}
