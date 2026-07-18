import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	getConversationMock,
	markReadMock,
	readHandlers,
	reconcileHandlers,
	showErrorToastMock,
} = vi.hoisted(() => ({
	getConversationMock: vi.fn(),
	markReadMock: vi.fn(),
	readHandlers: [] as ((event: unknown) => void)[],
	reconcileHandlers: [] as (() => void | Promise<void>)[],
	showErrorToastMock: vi.fn(),
}));

vi.mock("$lib/api/error", () => ({ showErrorToast: showErrorToastMock }));
vi.mock("$lib/app-data/preferences.svelte", () => ({
	getPreferences: () => Promise.resolve({ revealMessageRead: true }),
}));
vi.mock("$lib/api/messaging/conversations", () => ({
	markConversationAsRead: vi.fn(() => Promise.resolve()),
}));
vi.mock("$lib/api/messaging/messages", () => ({
	reactToMessage: vi.fn(),
	sendMessage: vi.fn(),
}));
vi.mock("$lib/util/reconcile", () => ({
	reconciler: {
		subscribe(handler: () => void | Promise<void>) {
			reconcileHandlers.push(handler);
			return vi.fn();
		},
	},
}));
vi.mock("./messages", () => ({ getConversation: getConversationMock }));
vi.mock("$lib/ws.svelte", async (importOriginal) => ({
	...(await importOriginal<typeof import("$lib/ws.svelte")>()),
	ws: {
		on(eventType: string, _schema: unknown, handler: (e: unknown) => void) {
			if (eventType === "chat.v1.conversation_read") readHandlers.push(handler);
			return Promise.resolve(vi.fn());
		},
	},
}));

import { ConversationState } from "./conversation-state.svelte";

const CONVERSATION_ID = "1:2";
const OUR_ID = 1;
const PEER_ID = 2;

const message = (messageId: string, timestamp: number) => ({
	messageId,
	conversationId: CONVERSATION_ID,
	senderId: OUR_ID,
	timestamp,
	unsent: false,
	reactions: [],
	type: "Text" as const,
	body: { text: messageId },
});

const profile = {
	distance: null,
	mediaHash: null,
	name: "Peer",
	onlineUntil: null,
	profileId: PEER_ID,
	showDistance: false,
};

function conversationsStub() {
	return {
		setActive: vi.fn(),
		clearActive: vi.fn(),
		getCachedConversation: vi.fn(() => undefined),
		setCachedConversation: vi.fn(),
		updatePreview: vi.fn(),
		markRead: markReadMock,
		ensureLoaded: vi.fn(),
	};
}

function create() {
	return new ConversationState({
		conversationId: CONVERSATION_ID,
		ourProfileId: OUR_ID,
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		conversations: conversationsStub() as any,
	});
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("ConversationState read marker", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		readHandlers.length = 0;
		reconcileHandlers.length = 0;
	});

	it("does not let a reconcile with no message deltas roll the marker backwards", async () => {
		const messages = [message("m2", 2000), message("m1", 1000)];
		getConversationMock.mockResolvedValue({
			messages,
			profile,
			pageKey: null,
			lastReadTimestamp: 1000,
		});

		const state = create();
		await flush();
		expect(state.lastReadTimestamp).toBe(1000);

		// peer reads the newest message while a reconcile is about to run
		readHandlers[0]?.({
			payload: {
				conversationId: CONVERSATION_ID,
				profileId: PEER_ID,
				timestamp: 2000,
			},
		});
		expect(state.lastReadTimestamp).toBe(2000);

		// reconcile returns the older watermark and no message deltas
		await reconcileHandlers[0]?.();
		await flush();

		expect(state.lastReadTimestamp).toBe(2000);
	});

	it("still advances the marker forward on reconcile", async () => {
		const messages = [message("m2", 2000), message("m1", 1000)];
		getConversationMock.mockResolvedValue({
			messages,
			profile,
			pageKey: null,
			lastReadTimestamp: 1000,
		});

		const state = create();
		await flush();
		expect(state.lastReadTimestamp).toBe(1000);

		getConversationMock.mockResolvedValue({
			messages,
			profile,
			pageKey: null,
			lastReadTimestamp: 2000,
		});
		await reconcileHandlers[0]?.();
		await flush();

		expect(state.lastReadTimestamp).toBe(2000);
	});

	it("keeps the marker when a paged fetch carries no read timestamp", async () => {
		getConversationMock.mockResolvedValue({
			messages: [message("m2", 2000), message("m1", 1000)],
			profile,
			pageKey: "page-2",
			lastReadTimestamp: 2000,
		});

		const state = create();
		await flush();
		expect(state.lastReadTimestamp).toBe(2000);

		getConversationMock.mockResolvedValue({
			messages: [message("m0", 500)],
			profile,
			pageKey: null,
			lastReadTimestamp: null,
		});
		await state.loadMore();
		await flush();

		expect(state.lastReadTimestamp).toBe(2000);
	});
});
