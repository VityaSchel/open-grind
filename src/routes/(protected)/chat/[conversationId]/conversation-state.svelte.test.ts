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
import { Drafts } from "$lib/chat/drafts.svelte";
import type {
	Message,
	MessageDraft,
	OutboundMessage,
} from "$lib/model/messaging/messages";
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
		remove: vi.fn(() => ({ revert: vi.fn() })),
		drafts: new Drafts(),
	};
}

function create(conversations = conversationsStub()) {
	return new ConversationState({
		conversationId: CONVERSATION_ID,
		ourProfileId: OUR_ID,
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		conversations: conversations as any,
	});
}

const flush = () => new Promise((r) => setTimeout(r, 0));

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((res) => {
		resolve = res;
	});
	return { promise, resolve };
}

function emitMessageSent(payload: unknown) {
	messageSentHandlers[0]?.({ payload });
}

function outbound(type: string, body: unknown): MessageDraft {
	const message = { type, body } as unknown as Message;
	return {
		outbound: message as unknown as OutboundMessage,
		optimistic: message,
	};
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

		state.send([outbound("Text", { text: "a" })]);
		state.send([outbound("Text", { text: "b" })]);

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

		state.send([outbound("Image", { mediaId: 5 })]);
		state.send([outbound("Text", { text: "hello" })]);

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

describe("ConversationState send failures", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		readHandlers.length = 0;
		messageSentHandlers.length = 0;
		reconcileHandlers.length = 0;
	});

	it("keeps the rejected send's error on the message so it can be copied", async () => {
		getConversationMock.mockResolvedValue({
			messages: [],
			profile,
			pageKey: null,
			lastReadTimestamp: null,
		});
		const rejection = new ApiError({
			message: "API request failed with status 403",
			request: { method: "POST", path: "/v4/chat/message/send" },
			response: {
				status: 403,
				body: JSON.stringify({
					type: "urn:gr:err:unauthorized_action",
				}),
			},
		});
		sendMessageMock.mockRejectedValue(rejection);
		const logged = vi.spyOn(console, "error").mockImplementation(() => {});

		const state = create();
		await flush();
		state.send([outbound("Text", { text: "a" })]);
		await flush();

		expect(state.messages[0]?.status).toBe("error");
		expect(state.messages[0]?.sendError).toBe(rejection);
		expect(logged).toHaveBeenCalledWith(
			"Failed to send message (urn:gr:err:unauthorized_action)",
			rejection,
		);
		logged.mockRestore();
	});
});

describe("ConversationState send timestamp", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		readHandlers.length = 0;
		messageSentHandlers.length = 0;
		reconcileHandlers.length = 0;
		getConversationMock.mockResolvedValue({
			messages: [],
			profile,
			pageKey: null,
			lastReadTimestamp: null,
		});
	});

	it("re-anchors the inbox row on the server timestamp of a sent message", async () => {
		sendMessageMock.mockResolvedValue({
			...echo("real-a", "Text", { text: "a" }),
			timestamp: 9000,
		});
		const conversations = conversationsStub();
		const state = create(conversations);
		await flush();

		state.send([outbound("Text", { text: "a" })]);
		const optimisticTimestamp = state.messages[0]!.timestamp;
		await flush();

		expect(optimisticTimestamp).not.toBe(9000);
		expect(state.messages[0]!.messageId).toBe("real-a");
		expect(state.messages[0]!.timestamp).toBe(9000);
		expect(conversations.updatePreview).toHaveBeenLastCalledWith(
			expect.objectContaining({
				conversationId: CONVERSATION_ID,
				timestamp: 9000,
			}),
		);
	});

	it("adopts the server timestamp when the echo beats the send response", async () => {
		const gate = deferred<{ messageId: string; timestamp: number }>();
		sendMessageMock.mockImplementation(() => gate.promise);
		const conversations = conversationsStub();
		const state = create(conversations);
		await flush();

		state.send([outbound("Text", { text: "a" })]);
		const optimisticTimestamp = state.messages[0]!.timestamp;
		emitMessageSent(echo("real-a", "Text", { text: "a" }));

		expect(optimisticTimestamp).not.toBe(5000);
		expect(state.messages[0]!.messageId).toBe("real-a");
		expect(state.messages[0]!.timestamp).toBe(5000);
		expect(conversations.updatePreview).toHaveBeenLastCalledWith(
			expect.objectContaining({
				conversationId: CONVERSATION_ID,
				timestamp: 5000,
			}),
		);

		gate.resolve({ messageId: "real-a", timestamp: 5000 });
		await flush();

		expect(state.messages[0]!.timestamp).toBe(5000);
	});

	it("keeps a peer reply that follows an echo-first send", async () => {
		sendMessageMock.mockImplementation(() => deferred().promise);
		const state = create();
		await flush();

		state.send([outbound("Text", { text: "a" })]);
		emitMessageSent(echo("real-a", "Text", { text: "a" }));
		emitMessageSent({
			...echo("peer-1", "Text", { text: "hi" }),
			senderId: PEER_ID,
			timestamp: 6000,
		});

		expect(state.messages.map((m) => m.messageId)).toEqual([
			"peer-1",
			"real-a",
		]);
	});

	it("keeps messages newest-first when a send resolves later than the next one", async () => {
		const gate = deferred<{ messageId: string; timestamp: number }>();
		const responses = [gate.promise, deferred().promise];
		sendMessageMock.mockImplementation(() => responses.shift());
		const state = create();
		await flush();

		state.send([outbound("Text", { text: "a" })]);
		state.send([outbound("Text", { text: "b" })]);
		const clientTimestamp = state.messages[0]!.timestamp;

		gate.resolve({
			messageId: "real-a",
			timestamp: clientTimestamp + 60_000,
		});
		await flush();

		const timestamps = state.messages.map((m) => m.timestamp);
		expect(state.messages[0]!.messageId).toBe("real-a");
		expect(timestamps).toEqual([...timestamps].sort((a, b) => b - a));
	});

	it("keeps the client timestamp when a send fails", async () => {
		sendMessageMock.mockRejectedValue(new Error("offline"));
		const conversations = conversationsStub();
		const state = create(conversations);
		await flush();

		state.send([outbound("Text", { text: "a" })]);
		const optimisticTimestamp = state.messages[0]!.timestamp;
		await flush();

		expect(state.messages[0]!.status).toBe("error");
		expect(state.messages[0]!.timestamp).toBe(optimisticTimestamp);
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
