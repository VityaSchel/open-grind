import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
	getConversationMock,
	markReadMock,
	markConversationAsReadMock,
	sendMessageMock,
	readHandlers,
	messageSentHandlers,
	reconcileHandlers,
	showErrorToastMock,
} = vi.hoisted(() => ({
	getConversationMock: vi.fn(),
	markReadMock: vi.fn(),
	markConversationAsReadMock: vi.fn(() => Promise.resolve()),
	sendMessageMock: vi.fn(),
	readHandlers: [] as ((event: unknown) => void)[],
	messageSentHandlers: [] as ((event: unknown) => void)[],
	reconcileHandlers: [] as (() => void | Promise<void>)[],
	showErrorToastMock: vi.fn(),
}));

vi.mock("$lib/api/error-toast", () => ({ showErrorToast: showErrorToastMock }));
vi.mock("$lib/app-data/preferences.svelte", () => ({
	getPreferences: () => Promise.resolve({ revealMessageRead: true }),
}));
vi.mock("$lib/api/messaging/conversations", () => ({
	markConversationAsRead: markConversationAsReadMock,
}));
vi.mock("$lib/api/messaging/messages", async (importOriginal) => ({
	...(await importOriginal<typeof import("$lib/api/messaging/messages")>()),
	reactToMessage: vi.fn(),
	sendMessage: sendMessageMock,
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
			if (eventType === "chat.v1.conversation_read")
				readHandlers.push(handler);
			if (eventType === "chat.v1.message_sent")
				messageSentHandlers.push(handler);
			return Promise.resolve(vi.fn());
		},
	},
}));

import { ApiError } from "$lib/api/api-error";
import { ConversationUnavailableError } from "$lib/api/messaging/messages";
import type { Message } from "$lib/model/messaging/messages";
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

function emitMessageSent(payload: unknown) {
	messageSentHandlers[0]?.({ payload });
}

function outbound(type: string, body: unknown): Message {
	return { type, body } as unknown as Message;
}

function echo(messageId: string, type: string, body: unknown) {
	return {
		messageId,
		conversationId: CONVERSATION_ID,
		senderId: OUR_ID,
		timestamp: 5000,
		unsent: false,
		reactions: [],
		type,
		body,
	};
}

describe("ConversationState read marker", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		readHandlers.length = 0;
		messageSentHandlers.length = 0;
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

		readHandlers[0]?.({
			payload: {
				conversationId: CONVERSATION_ID,
				profileId: PEER_ID,
				timestamp: 2000,
			},
		});
		expect(state.lastReadTimestamp).toBe(2000);

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

describe("ConversationState send echo matching", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		readHandlers.length = 0;
		messageSentHandlers.length = 0;
		reconcileHandlers.length = 0;
		sendMessageMock.mockReturnValue(new Promise(() => {}));
	});

	it("resolves concurrent send echoes FIFO, not to the newest pending", async () => {
		getConversationMock.mockResolvedValue({
			messages: [],
			profile,
			pageKey: null,
			lastReadTimestamp: null,
		});

		const state = create();
		await flush();

		state.send(outbound("Text", { text: "a" }));
		state.send(outbound("Text", { text: "b" }));

		const bodyText = (m: { body: unknown }) =>
			(m.body as { text: string }).text;
		expect(state.messages.map(bodyText)).toEqual(["b", "a"]);
		expect(state.messages.every((m) => m.status === "pending")).toBe(true);

		emitMessageSent(echo("real-a", "Text", { text: "a" }));

		const a = state.messages.find((m) => bodyText(m) === "a")!;
		const b = state.messages.find((m) => bodyText(m) === "b")!;
		expect(a.messageId).toBe("real-a");
		expect(a.status).toBe("sent");
		expect(b.status).toBe("pending");
		expect(b.messageId).not.toBe("real-a");

		emitMessageSent(echo("real-b", "Text", { text: "b" }));
		expect(b.messageId).toBe("real-b");
		expect(b.status).toBe("sent");
	});

	it("matches an echo by message type when echoes arrive out of send order", async () => {
		getConversationMock.mockResolvedValue({
			messages: [],
			profile,
			pageKey: null,
			lastReadTimestamp: null,
		});

		const state = create();
		await flush();

		state.send(outbound("Image", { mediaId: 5 }));
		state.send(outbound("Text", { text: "hello" }));

		const text = () => state.messages.find((m) => m.type === "Text")!;
		const image = () => state.messages.find((m) => m.type === "Image")!;
		expect(text().status).toBe("pending");
		expect(image().status).toBe("pending");

		emitMessageSent(echo("real-img", "Image", { mediaId: 5 }));
		expect(image().messageId).toBe("real-img");
		expect(image().status).toBe("sent");
		expect(text().status).toBe("pending");

		emitMessageSent(echo("real-text", "Text", { text: "hello" }));
		expect(text().messageId).toBe("real-text");
		expect(text().status).toBe("sent");
	});
});

describe("ConversationState read receipts", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		readHandlers.length = 0;
		messageSentHandlers.length = 0;
		reconcileHandlers.length = 0;
	});

	it("debounces a burst into a single read request for the newest message", async () => {
		getConversationMock.mockResolvedValue({
			messages: [],
			profile,
			pageKey: null,
			lastReadTimestamp: null,
		});
		const state = create();
		await flush();

		vi.useFakeTimers();
		try {
			state.reportRead({ messageId: "m1", timestamp: 1000 });
			state.reportRead({ messageId: "m2", timestamp: 1001 });
			await vi.advanceTimersByTimeAsync(500);

			expect(markConversationAsReadMock).toHaveBeenCalledTimes(1);
			expect(markConversationAsReadMock).toHaveBeenCalledWith({
				conversationId: CONVERSATION_ID,
				messageId: "m2",
			});
		} finally {
			vi.useRealTimers();
		}
	});

	it("flushes within the max-wait even under a continuous sub-debounce stream", async () => {
		getConversationMock.mockResolvedValue({
			messages: [],
			profile,
			pageKey: null,
			lastReadTimestamp: null,
		});
		const state = create();
		await flush();

		vi.useFakeTimers();
		try {
			for (let i = 0; i < 6; i++) {
				state.reportRead({ messageId: `m${i}`, timestamp: 1000 + i });
				await vi.advanceTimersByTimeAsync(400);
			}
			expect(markConversationAsReadMock).toHaveBeenCalled();
			expect(markConversationAsReadMock).toHaveBeenCalledWith({
				conversationId: CONVERSATION_ID,
				messageId: "m4",
			});
		} finally {
			vi.useRealTimers();
		}
	});
});

describe("ConversationState error classification", () => {
	const blocked = () =>
		new ApiError({
			message: "Request blocked",
			request: {
				method: "GET",
				path: "/v5/chat/conversation/1:2/message",
			},
			kind: "RequestBlocked",
		});

	const loaded = {
		messages: [message("m1", 1000)],
		profile,
		pageKey: "m1",
		lastReadTimestamp: null,
	};

	beforeEach(() => {
		vi.clearAllMocks();
		readHandlers.length = 0;
		messageSentHandlers.length = 0;
		reconcileHandlers.length = 0;
		vi.spyOn(console, "error").mockImplementation(() => {});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("keeps the loaded messages when a refresh is blocked", async () => {
		getConversationMock.mockResolvedValue(loaded);
		const state = create();
		await flush();

		getConversationMock.mockRejectedValue(blocked());
		await reconcileHandlers[0]?.();
		await flush();

		expect(state.error).toBeNull();
		expect(state.messages).toHaveLength(1);
		expect(showErrorToastMock).toHaveBeenCalledWith(
			expect.objectContaining({ label: "Failed to refresh messages" }),
		);
	});

	it("surfaces a refresh that finds the conversation gone", async () => {
		getConversationMock.mockResolvedValue(loaded);
		const state = create();
		await flush();

		getConversationMock.mockRejectedValue(
			new ConversationUnavailableError(CONVERSATION_ID),
		);
		await reconcileHandlers[0]?.();
		await flush();

		expect(state.error).toBeInstanceOf(ConversationUnavailableError);
		expect(showErrorToastMock).not.toHaveBeenCalled();
	});

	it("keeps the loaded messages when pagination is blocked", async () => {
		getConversationMock.mockResolvedValue(loaded);
		const state = create();
		await flush();

		getConversationMock.mockRejectedValue(blocked());
		await state.loadMore();

		expect(state.error).toBeNull();
		expect(state.messages).toHaveLength(1);
		expect(showErrorToastMock).toHaveBeenCalledWith(
			expect.objectContaining({ label: "Failed to load more messages" }),
		);
	});

	it("surfaces pagination that finds the conversation gone", async () => {
		getConversationMock.mockResolvedValue(loaded);
		const state = create();
		await flush();

		getConversationMock.mockRejectedValue(
			new ConversationUnavailableError(CONVERSATION_ID),
		);
		await state.loadMore();

		expect(state.error).toBeInstanceOf(ConversationUnavailableError);
	});

	it("clears the error on retry", async () => {
		getConversationMock.mockRejectedValue(blocked());
		const state = create();
		await flush();
		expect(state.error).toBeInstanceOf(ApiError);

		getConversationMock.mockResolvedValue(loaded);
		state.retry();
		await flush();

		expect(state.error).toBeNull();
		expect(state.messages).toHaveLength(1);
	});
});
