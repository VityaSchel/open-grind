import type { Conversation } from "$lib/model/messaging/conversations";

export type DemoMessage = { fromMe: boolean; reactions?: number } & (
	| { kind?: "text"; text: string }
	| { kind: "image" }
	| { kind: "profilePhotoReply"; text: string }
	| { kind: "expiringImage"; expired?: boolean }
	| {
			kind: "album";
			albumId: number;
			expiring?: "v1" | "v2";
			locked?: boolean;
			unseen?: boolean;
			coverUrl?: null;
	  }
	| {
			kind: "albumReply";
			albumId: number;
			albumContentId: number;
			text: string;
	  }
	| { kind: "unsent" }
	| { kind: "gif" }
);

export type DemoConversation = {
	withId: number;
	unread: number;
	pinned: boolean;
	favorite: boolean;
	muted: boolean;
	lastActivityAgo: number;
	rightNow?: Conversation["data"]["rightNow"];
	chemistry?: boolean;
	messages: DemoMessage[];
};

export const demoConversationSeeds: DemoConversation[] = [
	{
		withId: 100001,
		unread: 2,
		pinned: false,
		favorite: true,
		muted: true,
		lastActivityAgo: 4,
		messages: [
			{ fromMe: false, text: "Hey! Lorem ipsum dolor sit amet." },
			{
				fromMe: true,
				text: "Hello — consectetur adipiscing elit.",
				reactions: 1,
			},
			{ fromMe: false, text: "Sed do eiusmod tempor incididunt?" },
			{ fromMe: false, kind: "gif" },
			{ fromMe: false, kind: "album", albumId: 5001, unseen: true },
			{
				fromMe: false,
				kind: "album",
				albumId: 5001,
				coverUrl: null,
				unseen: true,
			},
			{ fromMe: true, kind: "album", albumId: 901 },
		],
	},
	{
		withId: 100006,
		unread: 1,
		pinned: false,
		favorite: false,
		muted: false,
		lastActivityAgo: 1,
		rightNow: "HOSTING",
		messages: [
			{ fromMe: true, text: "Hi, how are you?" },
			{ fromMe: true, kind: "gif" },
			{ fromMe: true, kind: "expiringImage" },
			{ fromMe: false, kind: "expiringImage", expired: true },
			{ fromMe: false, text: "Did you catch it? 👀" },
			{ fromMe: false, kind: "album", albumId: 5004, reactions: 1 },
			{
				fromMe: false,
				kind: "profilePhotoReply",
				text: "Great profile photo!",
			},
			{
				fromMe: false,
				kind: "albumReply",
				albumId: 901,
				albumContentId: 90100,
				text: "Great video!",
			},
		],
	},
	{
		withId: 100009,
		unread: 0,
		pinned: true,
		favorite: false,
		muted: false,
		lastActivityAgo: 52,
		chemistry: true,
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
			{ fromMe: false, kind: "image" },
			{ fromMe: false, text: "🐻 lorem ipsum", reactions: 2 },
		],
	},

	{
		withId: 100333,
		unread: 0,
		pinned: false,
		favorite: false,
		muted: false,
		lastActivityAgo: 45,
		messages: Array.from({ length: 80 }, (_, i) => ({
			fromMe: i % 3 === 0,
			text: `Backlog message ${i + 1}`,
		})),
	},
];
