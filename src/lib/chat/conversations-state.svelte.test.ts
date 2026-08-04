import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	getConversationsMock,
	markConversationAsReadMock,
	deleteConversationForMeMock,
	setConversationPinnedMock,
	setConversationMutedMock,
	showErrorToastMock,
	showIncomingMessageToastMock,
	reconcileHandlers,
	messageSentHandlers,
} = vi.hoisted(() => ({
	getConversationsMock: vi.fn(),
	markConversationAsReadMock: vi.fn(() => Promise.resolve()),
	deleteConversationForMeMock: vi.fn(() => Promise.resolve()),
	setConversationPinnedMock: vi.fn(() => Promise.resolve()),
	setConversationMutedMock: vi.fn(() => Promise.resolve()),
	showErrorToastMock: vi.fn(),
	showIncomingMessageToastMock: vi.fn(),
	reconcileHandlers: [] as (() => void | Promise<void>)[],
	messageSentHandlers: [] as ((event: unknown) => void)[],
}));

vi.mock("$app/state", () => ({ page: { route: { id: "/(protected)/chat" } } }));
vi.mock("$lib/api/error-toast", () => ({ showErrorToast: showErrorToastMock }));
vi.mock("$lib/api/messaging/conversations", () => ({
	getConversations: getConversationsMock,
	markConversationAsRead: markConversationAsReadMock,
	deleteConversationForMe: deleteConversationForMeMock,
	setConversationPinned: setConversationPinnedMock,
	setConversationMuted: setConversationMutedMock,
}));
vi.mock(
	"$lib/components/incoming-message-toast/incoming-message-toast-manager",
	() => ({ showIncomingMessageToast: showIncomingMessageToastMock }),
);
vi.mock("$lib/util/breakpoints.svelte", () => ({
	below: () => ({ current: false }),
}));
vi.mock("$lib/util/reconcile", () => ({
	reconciler: {
		subscribe(handler: () => void | Promise<void>) {
			reconcileHandlers.push(handler);
			return vi.fn();
		},
	},
}));
vi.mock("$lib/ws.svelte", async (importOriginal) => ({
	...(await importOriginal<typeof import("$lib/ws.svelte")>()),
	ws: {
		on(eventType: string, _schema: unknown, handler: (e: unknown) => void) {
			if (eventType === "chat.v1.message_sent")
				messageSentHandlers.push(handler);
			return Promise.resolve(vi.fn());
		},
	},
}));

import type { Conversation } from "$lib/model/messaging/conversations";
import { ConversationsState } from "./conversations-state.svelte";

const OUR_ID = 1;
const PEER_ID = 2;

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

function conversation(
	conversationId: string,
	lastActivityTimestamp: number,
	overrides: Partial<Conversation["data"]> = {},
): Conversation {
	return {
		type: "full_conversation_v1",
		data: {
			conversationId,
			name: `Conversation ${conversationId}`,
			participants: [
				{
					profileId: PEER_ID,
					primaryMediaHash: null,
					lastOnline: null,
					onlineUntil: null,
					distanceMetres: null,
					position: null,
					isInAList: false,
					hasDatingPotential: false,
				},
			],
			lastActivityTimestamp,
			unreadCount: 0,
			preview: null,
			muted: false,
			pinned: false,
			favorite: false,
			rightNow: "none",
			onlineUntil: null,
			hasUnreadThrob: false,
			...overrides,
		},
	} as unknown as Conversation;
}

function incomingMessage(
	conversationId: string,
	timestamp: number,
	senderId: number,
) {
	return {
		messageId: `m-${conversationId}-${timestamp}`,
		conversationId,
		senderId,
		timestamp,
		unsent: false,
		reactions: [],
		type: "Text",
		body: { text: "hi" },
	};
}

function emitMessageSent(payload: unknown) {
	messageSentHandlers[0]?.({ payload });
}

function entryFor(state: ConversationsState, conversationId: string) {
	const entry = state.entries.find(
		(e) => e.data.conversationId === conversationId,
	);
	if (!entry) throw new Error(`no entry for ${conversationId}`);
	return entry;
}

const microtasks = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
	vi.clearAllMocks();
	reconcileHandlers.length = 0;
	messageSentHandlers.length = 0;
});

describe("ConversationsState #syncLatest single-flight (P1.8)", () => {
	it("coalesces concurrent ensureLoaded into one page-1 fetch", async () => {
		getConversationsMock.mockResolvedValue({ entries: [], nextPage: null });
		const state = new ConversationsState(OUR_ID);
		await state.initial;
		getConversationsMock.mockClear();

		const gate = deferred<{
			entries: Conversation[];
			nextPage: number | null;
		}>();
		getConversationsMock.mockReturnValueOnce(gate.promise);

		const first = state.ensureLoaded("a:1");
		const second = state.ensureLoaded("b:2");
		gate.resolve({ entries: [], nextPage: null });
		await Promise.all([first, second]);

		expect(getConversationsMock).toHaveBeenCalledTimes(1);
	});

	it("allows a fresh sync after the previous one settles", async () => {
		getConversationsMock.mockResolvedValue({ entries: [], nextPage: null });
		const state = new ConversationsState(OUR_ID);
		await state.initial;
		getConversationsMock.mockClear();

		await state.ensureLoaded("a:1");
		await state.ensureLoaded("b:2");

		expect(getConversationsMock).toHaveBeenCalledTimes(2);
	});
});

describe("ConversationsState markRead rollback (P1.9)", () => {
	it("restores unread additively when mark-read fails after a concurrent increment", async () => {
		getConversationsMock.mockResolvedValue({
			entries: [conversation("a:1", 1000, { unreadCount: 3 })],
			nextPage: null,
		});
		const state = new ConversationsState(OUR_ID);
		await state.initial;

		const gate = deferred<void>();
		markConversationAsReadMock.mockReturnValueOnce(gate.promise);

		const markPromise = state.markRead("a:1");
		expect(entryFor(state, "a:1").data.unreadCount).toBe(0);

		emitMessageSent(incomingMessage("a:1", 2000, PEER_ID));
		expect(entryFor(state, "a:1").data.unreadCount).toBe(1);

		gate.reject(new Error("mark-read failed"));
		await markPromise;

		expect(entryFor(state, "a:1").data.unreadCount).toBe(4);
	});
});

describe("ConversationsState epoch guards (P1.7)", () => {
	it("does not let a stale loadMore resurrect nextPage after a reconcile ends the list", async () => {
		getConversationsMock.mockResolvedValueOnce({
			entries: [conversation("a:1", 1000)],
			nextPage: 2,
		});
		const state = new ConversationsState(OUR_ID);
		await state.initial;
		expect(state.nextPage).toBe(2);

		const loadGate = deferred<{
			entries: Conversation[];
			nextPage: number | null;
		}>();
		getConversationsMock.mockReturnValueOnce(loadGate.promise);
		const loadPromise = state.loadMore();

		getConversationsMock.mockResolvedValueOnce({
			entries: [conversation("a:1", 1000)],
			nextPage: null,
		});
		await reconcileHandlers[0]?.();
		expect(state.nextPage).toBeNull();

		loadGate.resolve({ entries: [conversation("b:2", 500)], nextPage: 3 });
		await loadPromise;
		await microtasks();

		expect(state.nextPage).toBeNull();
	});

	it("keeps the initial load's result when a reconcile races it and then fails", async () => {
		const initGate = deferred<{
			entries: Conversation[];
			nextPage: number | null;
		}>();
		getConversationsMock.mockReturnValueOnce(initGate.promise);
		const state = new ConversationsState(OUR_ID);

		const reconcilePromise = reconcileHandlers[0]?.();
		await microtasks();

		getConversationsMock.mockRejectedValueOnce(new Error("network"));
		initGate.resolve({ entries: [conversation("a:1", 1000)], nextPage: 2 });
		await state.initial;
		await reconcilePromise;

		expect(state.entries.map((e) => e.data.conversationId)).toEqual(["a:1"]);
		expect(state.nextPage).toBe(2);
	});

	it("discards a reconcile's stale writes when a loadMore supersedes it mid-paging", async () => {
		getConversationsMock.mockResolvedValueOnce({
			entries: [conversation("a:1", 1000)],
			nextPage: 2,
		});
		const state = new ConversationsState(OUR_ID);
		await state.initial;
		expect(state.nextPage).toBe(2);

		const reconcileGate = deferred<{
			entries: Conversation[];
			nextPage: number | null;
		}>();
		getConversationsMock.mockReturnValueOnce(reconcileGate.promise);
		const reconcilePromise = reconcileHandlers[0]?.();
		await microtasks();

		getConversationsMock.mockResolvedValueOnce({
			entries: [conversation("b:2", 500)],
			nextPage: 5,
		});
		await state.loadMore();
		expect(state.nextPage).toBe(5);

		reconcileGate.resolve({
			entries: [conversation("a:1", 1000)],
			nextPage: null,
		});
		await reconcilePromise;

		expect(state.nextPage).toBe(5);
	});
});
