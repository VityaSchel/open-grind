import { demoMeProfileId } from "../../../src/lib/demo/config";
import type {
	DemoConversation,
	DemoInbox,
	DemoMessage,
} from "../../../src/lib/demo/mock/conversation-seeds";

export const KINDS_ID = 100004;
export const QUOTES_ID = 100005;
export const MORE_QUOTES_ID = 100007;
export const PHOTO_ID = 100011;
const EXPIRING_PHOTO_ID = 100013;
const EXPIRING_VIDEO_ID = 100016;
const NAMELESS_ID = 100003;
export const PINNED_ID = 100009;
export const PINNED_MUTED_ID = 100014;

const HOUR_MINUTES = 60;
const YESTERDAY_MINUTES = 25 * HOUR_MINUTES;
const FIXTURE_HASH = "0f".repeat(20);

const VIDEO_BODY = {
	mediaId: 930_001,
	url: "https://cdns.grindr.com/videos/chat/fixture.mp4",
	contentType: "video/mp4",
	length: 8000,
	maxViews: 1,
	looping: false,
	viewsRemaining: 1,
};

const AUDIO_BODY = {
	mediaId: 930_002,
	mediaHash: "0a".repeat(32),
	url: "https://cdns.grindr.com/audio/chat/fixture.m4a",
	contentType: "audio/mp4",
	length: 4000,
	expiresAt: null,
};

const GIPHY_BODY = {
	id: "fixture",
	urlPath: "https://picsum.photos/seed/fixture-gif/240/240",
	stillPath: "https://picsum.photos/seed/fixture-still/240/240",
	previewPath: "fixture",
	width: 240,
	height: 240,
	imageHash: FIXTURE_HASH,
};

const RIGHT_NOW_BODY = {
	requestId: 7,
	requestCreatedAt: 1_784_000_000_000,
	requestUpdatedAt: 1_784_000_000_000,
	postStatus: null,
	postId: null,
	medias: [],
};

export function conversationPath(withId: number): string {
	return `/chat/${Math.min(demoMeProfileId, withId)}:${Math.max(demoMeProfileId, withId)}`;
}

function wire({
	fromMe,
	type,
	body,
}: {
	fromMe: boolean;
	type: string;
	body: unknown;
}): DemoMessage {
	return { fromMe, kind: "wire", type, body };
}

function quoting({
	quote,
	fromMe,
	text,
}: {
	quote: DemoMessage;
	fromMe: boolean;
	text: string;
}): DemoMessage {
	return { fromMe, text, quote };
}

function conversation({
	withId,
	lastActivityAgo,
	messages,
	...flags
}: Pick<DemoConversation, "withId" | "lastActivityAgo" | "messages"> &
	Partial<DemoConversation>): DemoConversation {
	return {
		withId,
		unread: 0,
		pinned: false,
		favorite: false,
		muted: false,
		lastActivityAgo,
		messages,
		...flags,
	};
}

const kinds = conversation({
	withId: KINDS_ID,
	lastActivityAgo: 0,
	hidesDistance: true,
	messages: [
		wire({
			fromMe: false,
			type: "Gaymoji",
			body: { imageHash: FIXTURE_HASH },
		}),
		{ fromMe: true, kind: "unsent" },
		{ fromMe: false, kind: "expiringImage", expired: true },
		{ fromMe: false, kind: "expiringImage" },
		wire({ fromMe: false, type: "Video", body: VIDEO_BODY }),
		{ fromMe: false, kind: "image" },
		{ fromMe: false, text: "Lorem ipsum dolor sit amet.", reactions: 1 },
		{ fromMe: true, text: "Consectetur adipiscing elit." },
	],
});

const quotes = conversation({
	withId: QUOTES_ID,
	lastActivityAgo: 3,
	messages: [
		quoting({
			fromMe: false,
			text: "Lorem ipsum.",
			quote: { fromMe: true, kind: "unsent" },
		}),
		quoting({
			fromMe: true,
			text: "Dolor sit amet.",
			quote: wire({ fromMe: false, type: "Audio", body: AUDIO_BODY }),
		}),
		quoting({
			fromMe: false,
			text: "Consectetur adipiscing.",
			quote: wire({ fromMe: true, type: "NonExpiringVideo", body: {} }),
		}),
		quoting({
			fromMe: true,
			text: "Sed do eiusmod.",
			quote: wire({ fromMe: false, type: "VideoCall", body: {} }),
		}),
		quoting({
			fromMe: false,
			text: "Tempor incididunt.",
			quote: wire({
				fromMe: true,
				type: "Gaymoji",
				body: { imageHash: FIXTURE_HASH },
			}),
		}),
	],
});

const moreQuotes = conversation({
	withId: MORE_QUOTES_ID,
	lastActivityAgo: 9,
	messages: [
		quoting({
			fromMe: false,
			text: "Ut labore.",
			quote: wire({ fromMe: true, type: "Giphy", body: GIPHY_BODY }),
		}),
		quoting({
			fromMe: true,
			text: "Et dolore magna.",
			quote: wire({
				fromMe: false,
				type: "Location",
				body: { lat: 10, lon: -35 },
			}),
		}),
		quoting({
			fromMe: false,
			text: "Aliqua enim.",
			quote: wire({ fromMe: true, type: "ProfileLink", body: {} }),
		}),
		quoting({
			fromMe: true,
			text: "Ad minim veniam.",
			quote: wire({
				fromMe: false,
				type: "RightNowRequest",
				body: RIGHT_NOW_BODY,
			}),
		}),
		quoting({
			fromMe: false,
			text: "Quis nostrud.",
			quote: wire({ fromMe: true, type: "Generative", body: {} }),
		}),
	],
});

export const PREVIEWS_INBOX: DemoInbox = {
	nextPage: null,
	conversations: [
		kinds,
		quotes,
		moreQuotes,
		conversation({
			withId: PHOTO_ID,
			lastActivityAgo: 8 * HOUR_MINUTES,
			unread: 120,
			messages: [{ fromMe: false, kind: "image" }],
		}),
		conversation({
			withId: EXPIRING_PHOTO_ID,
			lastActivityAgo: 45,
			messages: [{ fromMe: false, kind: "expiringImage" }],
		}),
		conversation({
			withId: EXPIRING_VIDEO_ID,
			lastActivityAgo: 2 * HOUR_MINUTES,
			messages: [
				wire({ fromMe: false, type: "Video", body: VIDEO_BODY }),
			],
		}),
		conversation({
			withId: NAMELESS_ID,
			name: "",
			lastActivityAgo: 5 * HOUR_MINUTES,
			messages: [
				wire({ fromMe: false, type: "Audio", body: AUDIO_BODY }),
			],
		}),
		conversation({
			withId: PINNED_ID,
			pinned: true,
			lastActivityAgo: YESTERDAY_MINUTES,
			messages: [{ fromMe: true, text: "Duis aute irure dolor." }],
		}),
		conversation({
			withId: PINNED_MUTED_ID,
			pinned: true,
			muted: true,
			unread: 2,
			lastActivityAgo: YESTERDAY_MINUTES + HOUR_MINUTES,
			messages: [
				{ fromMe: false, text: "Excepteur sint occaecat." },
				{ fromMe: false, text: "Cupidatat non proident." },
			],
		}),
	],
};

export const PAGED_INBOX: DemoInbox = { ...PREVIEWS_INBOX, nextPage: 2 };
