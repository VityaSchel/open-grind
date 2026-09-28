import { beforeEach, describe, expect, it, vi } from "vitest";

const { getConversationMock } = vi.hoisted(() => ({
	getConversationMock: vi.fn(),
}));

vi.mock("$lib/api/error-toast", () => ({ showErrorToast: vi.fn() }));
vi.mock("$lib/app-data/preferences.svelte", () => ({
	getPreferences: () => Promise.resolve({ revealMessageRead: true }),
}));
vi.mock("$lib/api/messaging/conversations", () => ({
	markConversationAsRead: vi.fn(() => Promise.resolve()),
}));
vi.mock("$lib/util/reconcile", () => ({
	reconciler: { subscribe: () => vi.fn() },
}));
vi.mock("./messages", () => ({ getConversation: getConversationMock }));
vi.mock("$lib/ws.svelte", async (importOriginal) => ({
	...(await importOriginal<typeof import("$lib/ws.svelte")>()),
	ws: { on: () => Promise.resolve(vi.fn()) },
}));

import { Drafts } from "$lib/chat/drafts.svelte";
import { ConversationState } from "./conversation-state.svelte";

const CONVERSATION_ID = "1:2";
const SIGNED_AT_S = 1_700_000_000;

const profile = {
	distance: null,
	mediaHash: null,
	name: "Peer",
	onlineUntil: null,
	profileId: 2,
	showDistance: false,
};

const photo = ({
	signature,
	expires,
}: {
	signature: string;
	expires: number;
}) => ({
	messageId: "photo",
	conversationId: CONVERSATION_ID,
	senderId: 2,
	timestamp: 1000,
	unsent: false,
	reactions: [],
	type: "Image" as const,
	body: {
		mediaId: 1,
		width: 300,
		height: 400,
		url: `https://d3.cloudfront.net/chat/p.jpg?Expires=${expires}&Signature=${signature}&Key-Pair-Id=K`,
		imageHash: "a".repeat(64),
		takenOnGrindr: false,
		createdAt: 1000,
	},
});

const page = (message: ReturnType<typeof photo>) => ({
	messages: [message],
	profile,
	pageKey: null,
	lastReadTimestamp: null,
});

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("ConversationState signed media", () => {
	beforeEach(() => vi.clearAllMocks());

	it("reopens a cached chat an hour later with the photo re-signed", async () => {
		getConversationMock.mockResolvedValue(
			page(photo({ signature: "NEW", expires: SIGNED_AT_S + 75 * 60 })),
		);
		const state = new ConversationState({
			conversationId: CONVERSATION_ID,
			ourProfileId: 1,
			conversations: {
				setActive: vi.fn(),
				clearActive: vi.fn(),
				getCachedConversation: vi.fn(() =>
					page(
						photo({
							signature: "OLD",
							expires: SIGNED_AT_S + 15 * 60,
						}),
					),
				),
				setCachedConversation: vi.fn(),
				updatePreview: vi.fn(),
				markRead: vi.fn(),
				ensureLoaded: vi.fn(),
				remove: vi.fn(() => ({ revert: vi.fn() })),
				drafts: new Drafts(),
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
			} as any,
		});
		await flush();

		expect(state.messages[0]?.body).toMatchObject({
			url: expect.stringContaining("Signature=NEW"),
		});
	});
});
