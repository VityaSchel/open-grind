import type { Conversation } from "$lib/model/conversation";
import type { ApiResponseMessage } from "$lib/model/message";
import { demoMeProfileId, MINUTE, NOW } from "../config";
import { hashFromSeed } from "./avatars";
import { lastOnlineOf, onlineUntilOf, photosOf, profileSeed } from "./profiles";

type DemoMessage = { fromMe: boolean; text?: string; image?: boolean };

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
			{ fromMe: true, text: "Hello — consectetur adipiscing elit." },
			{ fromMe: false, text: "Sed do eiusmod tempor incididunt?" },
			{ fromMe: false, text: "Ut labore et dolore magna aliqua." },
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
			{ fromMe: false, image: true },
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
			{ fromMe: false, text: "🐻 lorem ipsum" },
		],
	},
];

const MESSAGE_GAP = 7 * MINUTE;
const DEMO_IMAGE_URL = "https://picsum.photos/seed/opengrind-demo/600/800";

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
	if (message.image) {
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
			messageId,
			conversationId,
			senderId,
			timestamp,
			unsent: false,
			reactions: [],
		};
	}
	return {
		type: "Text",
		body: { text: message.text ?? "" },
		messageId,
		conversationId,
		senderId,
		timestamp,
		unsent: false,
		reactions: [],
	};
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

function previewFor(conv: DemoConversation) {
	const last = conv.messages.at(-1);
	const isImage = last?.image ?? false;
	return {
		type: isImage ? "Image" : "Text",
		text: isImage ? null : (last?.text ?? null),
		albumId: null,
		imageHash: null,
	};
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
					preview: previewFor(conv),
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

export function demoSentMessage(body: unknown): ApiResponseMessage {
	const sent = body as {
		type?: string;
		target?: { targetId?: number };
		body?: unknown;
	};
	const targetId = sent.target?.targetId ?? 0;
	const timestamp = NOW;
	return {
		type: "Text",
		body:
			sent.type === "Text" && sent.body && typeof sent.body === "object"
				? (sent.body as { text: string })
				: { text: "" },
		messageId: `${timestamp}:demo-sent-${targetId}`,
		conversationId: conversationIdFor(targetId),
		senderId: demoMeProfileId,
		timestamp,
		unsent: false,
		reactions: [],
	};
}
