import {
	type ApiResponseMessage,
	previewFromMessage,
} from "$lib/model/message";
import type { AlbumExpirationType } from "$lib/model/album";
import type { Conversation } from "$lib/model/conversation";
import { DAY, demoMeProfileId, HOUR, MINUTE, NOW } from "../config";
import { hashFromSeed } from "./avatars";
import { lastOnlineOf, onlineUntilOf, photosOf, profileSeed } from "./profiles";

type DemoMessage = { fromMe: boolean; reactions?: number } & (
	| { kind?: "text"; text: string }
	| { kind: "image" }
	| { kind: "expiringImage"; expired?: boolean }
	| {
			kind: "album";
			albumId: number;
			expiring?: "v1" | "v2";
			locked?: boolean;
			unseen?: boolean;
			coverUrl?: null;
	  }
	| { kind: "unsent" }
);

type DemoConversation = {
	withId: number;
	unread: number;
	pinned: boolean;
	favorite: boolean;
	muted: boolean;
	lastActivityAgo: number;
	messages: DemoMessage[];
};

const demoConversationSeeds: DemoConversation[] = [
	{
		withId: 100001,
		unread: 2,
		pinned: false,
		favorite: true,
		muted: false,
		lastActivityAgo: 4,
		messages: [
			{ fromMe: false, text: "Hey! Lorem ipsum dolor sit amet." },
			{
				fromMe: true,
				text: "Hello — consectetur adipiscing elit.",
				reactions: 1,
			},
			{ fromMe: false, text: "Sed do eiusmod tempor incididunt?" },
			{ fromMe: false, kind: "album", albumId: 5001, unseen: true },
			{
				fromMe: false,
				kind: "album",
				albumId: 5001,
				coverUrl: null,
				unseen: true,
			},
		],
	},
	{
		withId: 100006,
		unread: 1,
		pinned: false,
		favorite: false,
		muted: false,
		lastActivityAgo: 1,
		messages: [
			{ fromMe: false, text: "👀" },
			{ fromMe: true, text: "Lorem ipsum?" },
			{ fromMe: true, kind: "expiringImage" },
			{ fromMe: false, kind: "expiringImage", expired: true },
			{ fromMe: false, text: "Did you catch it? 🔥" },
			{ fromMe: false, kind: "image", reactions: 1 },
		],
	},
	{
		withId: 100009,
		unread: 0,
		pinned: true,
		favorite: false,
		muted: false,
		lastActivityAgo: 52,
		messages: [
			{ fromMe: true, text: "Quis nostrud exercitation." },
			{ fromMe: false, text: "Ullamco laboris nisi." },
			{ fromMe: true, kind: "unsent" },
			{
				fromMe: false,
				kind: "album",
				albumId: 5002,
				expiring: "v1",
				locked: true,
			},
			{ fromMe: true, text: "Ut aliquip ex ea commodo." },
		],
	},
	{
		withId: 100250,
		unread: 0,
		pinned: false,
		favorite: false,
		muted: true,
		lastActivityAgo: 18,
		messages: [
			{ fromMe: false, text: "Lorem ipsum" },
			{ fromMe: false, kind: "album", albumId: 5003, expiring: "v2" },
			{ fromMe: true, text: "ok 👍" },
		],
	},
	{
		withId: 100777,
		unread: 3,
		pinned: false,
		favorite: false,
		muted: false,
		lastActivityAgo: 7,
		messages: [
			{ fromMe: false, text: "Lorem ipsum dolor sit amet consectetur." },
			{ fromMe: false, text: "Lorem ipsum dolor sit amet." },
			{ fromMe: false, text: "Lorem ipsum dolor sit." },
		],
	},
	{
		withId: 100002,
		unread: 0,
		pinned: false,
		favorite: false,
		muted: false,
		lastActivityAgo: 320,
		messages: [
			{ fromMe: true, text: "Duis aute irure dolor." },
			{ fromMe: false, kind: "expiringImage" },
			{ fromMe: false, text: "🐻 lorem ipsum", reactions: 2 },
		],
	},
];

const MESSAGE_GAP = 7 * MINUTE;
const DEMO_IMAGE_URL = "https://picsum.photos/seed/opengrind-demo/600/800";

function picsum(seed: string, width = 600, height = 800): string {
	return `https://picsum.photos/seed/${encodeURIComponent(seed)}/${width}/${height}`;
}

function localDateTime(timestamp: number): string {
	return new Date(timestamp).toISOString().slice(0, 19);
}

export function conversationIdFor(withId: number): string {
	return `${Math.min(demoMeProfileId, withId)}:${Math.max(demoMeProfileId, withId)}`;
}

const demoConversationById = new Map(
	demoConversationSeeds.map((conv) => [conversationIdFor(conv.withId), conv]),
);

function lastActivityOf(conv: DemoConversation): number {
	return NOW - conv.lastActivityAgo * MINUTE;
}

function buildMessage(
	conv: DemoConversation,
	message: DemoMessage,
	index: number,
	timestamp: number,
): ApiResponseMessage {
	const conversationId = conversationIdFor(conv.withId);
	const messageId = `${index}:demo-${conv.withId}-${index}`;
	const senderId = message.fromMe ? demoMeProfileId : conv.withId;
	const reactions = Array.from({ length: message.reactions ?? 0 }, () => ({
		profileId: message.fromMe ? conv.withId : demoMeProfileId,
		reactionType: 1,
	}));
	const base = { messageId, conversationId, senderId, timestamp, reactions };
	switch (message.kind) {
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
					url: picsum(`expiring-${conv.withId}-${index}`),
					viewsRemaining: message.expired ? 0 : 1,
				},
				...base,
				unsent: false,
			};
		case "album": {
			const albumBody = {
				albumId: message.albumId,
				hasUnseenContent: message.unseen ?? false,
				expiresAt: message.expiring ? timestamp + DAY : null,
				expirationType: (message.expiring
					? "ONCE"
					: "INDEFINITE") satisfies AlbumExpirationType,
				coverUrl:
					message.coverUrl === null
						? null
						: message.locked
							? null
							: albumCoverUrl(message.albumId),
				ownerProfileId: message.fromMe ? demoMeProfileId : conv.withId,
				isViewable: !message.locked,
				hasVideo: false,
				hasPhoto: true,
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

function albumCoverUrl(albumId: number): string {
	return picsum(`album-${albumId}-cover`, 300, 400);
}

function threadMessages(conv: DemoConversation): ApiResponseMessage[] {
	const lastActivity = lastActivityOf(conv);
	const count = conv.messages.length;
	const ordered = conv.messages.map((message, i) =>
		buildMessage(
			conv,
			message,
			i,
			lastActivity - (count - 1 - i) * MESSAGE_GAP,
		),
	);
	return ordered.reverse();
}

export function demoConversations(page: number): {
	entries: Conversation[];
	nextPage: number | null;
} {
	if (page > 1) return { entries: [], nextPage: null };
	const entries: Conversation[] = demoConversationSeeds
		.map((conv): Conversation => {
			const seed = profileSeed(conv.withId);
			const photos = photosOf(conv.withId);
			const latest = threadMessages(conv).at(0);
			return {
				type: "full_conversation_v1",
				data: {
					conversationId: conversationIdFor(conv.withId),
					name: seed.name ?? "Grindr user",
					participants: [
						{
							profileId: conv.withId,
							primaryMediaHash: photos[0] ?? null,
							lastOnline: lastOnlineOf(seed),
							onlineUntil: onlineUntilOf(seed),
							distanceMetres: seed.distanceM,
							position: seed.position,
							isInAList: seed.favorite,
							hasDatingPotential: false,
						},
					],
					lastActivityTimestamp: lastActivityOf(conv),
					unreadCount: conv.unread,
					preview: previewFromMessage(latest),
					muted: conv.muted,
					pinned: conv.pinned,
					favorite: conv.favorite,
					rightNow: "NOT_ACTIVE",
					onlineUntil: onlineUntilOf(seed),
					hasUnreadThrob: false,
				},
			};
		})
		.sort(
			(a, b) => b.data.lastActivityTimestamp - a.data.lastActivityTimestamp,
		);
	return { entries, nextPage: null };
}

export function demoConversationMessages(
	conversationId: string,
	pageKey?: string,
) {
	const conv = demoConversationById.get(conversationId);
	const seed = conv ? profileSeed(conv.withId) : undefined;
	const photos = conv ? photosOf(conv.withId) : [];
	const profile = {
		distance: seed?.distanceM ?? null,
		mediaHash: photos[0] ?? null,
		name: seed?.name ?? null,
		onlineUntil: seed ? onlineUntilOf(seed) : null,
		profileId: conv?.withId ?? 0,
		showDistance: seed?.distanceM != null,
	};
	if (!conv || pageKey !== undefined) {
		return { lastReadTimestamp: null, messages: [], profile };
	}
	const messages = threadMessages(conv);
	const lastReadTimestamp =
		conv.unread > 0 ? (messages[conv.unread]?.timestamp ?? null) : NOW;
	return { lastReadTimestamp, messages, profile };
}

export function demoSingleMessage(conversationId: string, messageId: string) {
	const conv = demoConversationById.get(conversationId);
	const message = conv
		? threadMessages(conv).find((entry) => entry.messageId === messageId)
		: undefined;
	return { message: message ?? null };
}

export function demoAlbumContent(albumId: number) {
	const count = 3 + (albumId % 3);
	const content = Array.from({ length: count }, (_, i) => {
		const thumb = picsum(`album-${albumId}-${i}`, 300, 400);
		return {
			contentId: albumId * 100 + i,
			contentType: "image/jpeg",
			coverUrl: thumb,
			statusId: 1,
			thumbUrl: thumb,
			url: picsum(`album-${albumId}-${i}`),
			processing: false,
			rejectionId: null,
		};
	});
	return {
		albumId,
		hasUnseenContent: false,
		albumName: null,
		profileId: demoMeProfileId,
		albumViewable: true,
		sharedCount: 1,
		createdAt: localDateTime(NOW - 3 * DAY),
		updatedAt: localDateTime(NOW - DAY),
		content,
	};
}

let demoSentCounter = 0;

export function demoSentMessage(body: unknown): ApiResponseMessage {
	const sent = body as {
		type?: string;
		target?: { targetId?: number };
		body?: unknown;
	};
	const targetId = sent.target?.targetId ?? 0;
	const timestamp = NOW;
	const overlay = {
		messageId: `${timestamp}:demo-sent-${targetId}-${demoSentCounter++}`,
		conversationId: conversationIdFor(targetId),
		senderId: demoMeProfileId,
		timestamp,
		unsent: false,
		reactions: [],
	};
	if (sent.type === "Image" && sent.body && typeof sent.body === "object") {
		const { mediaId } = sent.body as { mediaId: number };
		const item = demoDrawerMedia().find((media) => media.id === mediaId);
		return {
			type: "Image",
			body: {
				mediaId,
				width: null,
				height: null,
				url: item?.url ?? DEMO_IMAGE_URL,
				imageHash: hashFromSeed(`drawer-${mediaId}`),
				takenOnGrindr: item?.takenOnGrindr ?? false,
				createdAt: item?.createdTs ?? timestamp,
			},
			...overlay,
		};
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

type DemoDrawerMedia = {
	id: number;
	url: string;
	contentType: string;
	createdTs: number;
	used: boolean;
	takenOnGrindr: boolean;
};

let uploadedDrawerMediaId = 920_000;
const uploadedDrawerMedia: DemoDrawerMedia[] = [];

export function demoUploadChatMedia(
	bytes: Uint8Array<ArrayBuffer>,
	contentType: string,
): { mediaId: number; url: string; mediaHash: string } {
	const item: DemoDrawerMedia = {
		id: uploadedDrawerMediaId++,
		url: URL.createObjectURL(new Blob([bytes], { type: contentType })),
		contentType,
		createdTs: Date.now(),
		used: false,
		takenOnGrindr: false,
	};
	uploadedDrawerMedia.unshift(item);
	return {
		mediaId: item.id,
		url: item.url,
		mediaHash: hashFromSeed(`drawer-${item.id}`),
	};
}

export function demoDrawerMedia(): DemoDrawerMedia[] {
	return [
		...uploadedDrawerMedia,
		...Array.from({ length: 10 }, (_, index) => ({
			id: 910_000 + index,
			url: `https://picsum.photos/seed/opengrind-drawer-${index}/600/800`,
			contentType: "image/jpeg",
			createdTs: NOW - (index + 1) * HOUR,
			used: index % 3 === 0,
			takenOnGrindr: false,
		})),
	];
}
