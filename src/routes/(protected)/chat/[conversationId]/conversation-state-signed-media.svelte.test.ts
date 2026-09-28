import { beforeEach, describe, expect, it, vi } from "vitest";

const { getConversationMock, refreshMessagesByIdMock } = vi.hoisted(() => ({
	getConversationMock: vi.fn(),
	refreshMessagesByIdMock: vi.fn(),
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
vi.mock("$lib/api/messaging/messages", async (importOriginal) => ({
	...(await importOriginal<typeof import("$lib/api/messaging/messages")>()),
	refreshMessagesById: refreshMessagesByIdMock,
}));
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

	it("renews a dynamic album outside the refetched page by id", async () => {
		const album = (signature: string, expires: number) => ({
			messageId: "album",
			conversationId: CONVERSATION_ID,
			senderId: 2,
			timestamp: 1000,
			unsent: false,
			reactions: [],
			dynamic: true,
			type: "Album" as const,
			body: {
				albumId: 7,
				coverUrl: `https://d3.cloudfront.net/c.jpg?Expires=${expires}&Signature=${signature}&Key-Pair-Id=K`,
				ownerProfileId: 2,
				isViewable: true,
				hasPhoto: true,
				hasVideo: false,
			},
		});
		const newer = {
			...photo({ signature: "P", expires: SIGNED_AT_S }),
			messageId: "newer",
			timestamp: 5000,
		};
		getConversationMock.mockResolvedValue({
			...page(newer),
			messages: [newer],
		});
		refreshMessagesByIdMock.mockImplementation(async () => {
			await flush();
			return { messages: [album("NEW", SIGNED_AT_S + 75 * 60)] };
		});
		const setCachedConversation = vi.fn();
		const state = new ConversationState({
			conversationId: CONVERSATION_ID,
			ourProfileId: 1,
			conversations: {
				setActive: vi.fn(),
				clearActive: vi.fn(),
				getCachedConversation: vi.fn(() => ({
					...page(newer),
					messages: [newer, album("OLD", SIGNED_AT_S + 15 * 60)],
				})),
				setCachedConversation,
				updatePreview: vi.fn(),
				markRead: vi.fn(),
				ensureLoaded: vi.fn(),
				remove: vi.fn(() => ({ revert: vi.fn() })),
				drafts: new Drafts(),
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
			} as any,
		});
		await flush();
		await flush();
		state.destroy();

		const cached = setCachedConversation.mock.lastCall?.[0] as {
			data: { messages: { messageId: string; body: unknown }[] };
		};
		expect(
			cached.data.messages.find((m) => m.messageId === "album")?.body,
		).toMatchObject({ coverUrl: expect.stringContaining("Signature=NEW") });
		expect(refreshMessagesByIdMock).toHaveBeenCalledWith({
			conversationId: CONVERSATION_ID,
			messageIds: ["album"],
		});
		expect(
			state.messages.find((m) => m.messageId === "album")?.body,
		).toMatchObject({ coverUrl: expect.stringContaining("Signature=NEW") });
	});
});
