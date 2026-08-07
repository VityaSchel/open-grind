import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	getConversationsMock,
	markConversationAsReadMock,
	deleteConversationForMeMock,
	setConversationPinnedMock,
	setConversationMutedMock,
	showErrorToastMock,
	onIncomingMessage,
	currentPage,
	singleColumn,
	reconcileHandlers,
	messageSentHandlers,
} = vi.hoisted(() => ({
	getConversationsMock: vi.fn(),
	markConversationAsReadMock: vi.fn(() => Promise.resolve()),
	deleteConversationForMeMock: vi.fn(() => Promise.resolve()),
	setConversationPinnedMock: vi.fn(() => Promise.resolve()),
	setConversationMutedMock: vi.fn(() => Promise.resolve()),
	showErrorToastMock: vi.fn(),
	onIncomingMessage: vi.fn(),
	currentPage: { route: { id: "/(protected)/chat" } },
	singleColumn: { current: false },
	reconcileHandlers: [] as (() => void | Promise<void>)[],
	messageSentHandlers: [] as ((event: unknown) => void)[],
}));

vi.mock("$app/state", () => ({ page: currentPage }));
vi.mock("$lib/api/error-toast", () => ({ showErrorToast: showErrorToastMock }));
vi.mock("$lib/api/messaging/conversations", () => ({
	getConversations: getConversationsMock,
	markConversationAsRead: markConversationAsReadMock,
	deleteConversationForMe: deleteConversationForMeMock,
	setConversationPinned: setConversationPinnedMock,
	setConversationMuted: setConversationMutedMock,
}));
vi.mock("$lib/util/breakpoints.svelte", () => ({ below: () => singleColumn }));
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
	currentPage.route.id = "/(protected)/chat";
	singleColumn.current = false;
	reconcileHandlers.length = 0;
	messageSentHandlers.length = 0;
});

async function settled(state: ConversationsState) {
	await vi.waitFor(() => expect(state.loading).toBe(false));
}

describe("ConversationsState initial load", () => {
	it("reports a failed first load and clears it on retry", async () => {
		getConversationsMock.mockRejectedValueOnce(new Error("offline"));
		const state = new ConversationsState({
			ourProfileId: OUR_ID,
			onIncomingMessage: vi.fn(),
		});
		await settled(state);

		expect(state.error).toEqual(new Error("offline"));
		expect(state.entries).toHaveLength(0);

		getConversationsMock.mockResolvedValueOnce({
			entries: [conversation("a:1", 1000)],
			nextPage: null,
		});
		state.retry();
		expect(state.loading).toBe(true);
		await settled(state);

		expect(state.error).toBeNull();
		expect(state.entries).toHaveLength(1);
	});

	it("puts a rolled-back pin back in its original place", async () => {
		getConversationsMock.mockResolvedValue({
			entries: [conversation("a:1", 2000), conversation("b:2", 1000)],
			nextPage: null,
		});
		const state = new ConversationsState({
			ourProfileId: OUR_ID,
			onIncomingMessage: vi.fn(),
		});
		await settled(state);
		const order = () =>
			state.entries.map((entry) => entry.data.conversationId);
		expect(order()).toEqual(["a:1", "b:2"]);

		setConversationPinnedMock.mockRejectedValueOnce(new Error("nope"));
		await state.setPinned({ conversationIds: ["b:2"], pinned: true });

		expect(entryFor(state, "b:2").data.pinned).toBe(false);
		expect(order()).toEqual(["a:1", "b:2"]);
	});
});

describe("ConversationsState incoming-message handler (P6.3)", () => {
	async function stateAwayFromTheInbox(
		overrides: Partial<Conversation["data"]> = {},
	) {
		currentPage.route.id = "/(protected)/(navbar)";
		singleColumn.current = true;
		getConversationsMock.mockResolvedValue({
			entries: [conversation("a:1", 1000, overrides)],
			nextPage: null,
		});
		const state = new ConversationsState({
			ourProfileId: OUR_ID,
			onIncomingMessage,
		});
		await settled(state);
		return state;
	}

	it("hands an incoming message to the handler with its conversation", async () => {
		const state = await stateAwayFromTheInbox();
		const message = incomingMessage("a:1", 2000, PEER_ID);

		emitMessageSent(message);

		expect(onIncomingMessage).toHaveBeenCalledExactlyOnceWith({
			message,
			conversation: entryFor(state, "a:1"),
		});
	});

	it("stays silent for a muted conversation", async () => {
		await stateAwayFromTheInbox({ muted: true });

		emitMessageSent(incomingMessage("a:1", 2000, PEER_ID));

		expect(onIncomingMessage).not.toHaveBeenCalled();
	});

	it("stays silent while the conversations list is on screen", async () => {
		const state = await stateAwayFromTheInbox();
		currentPage.route.id = "/(protected)/chat";
		onIncomingMessage.mockClear();

		emitMessageSent(incomingMessage("a:1", 2000, PEER_ID));
		await microtasks();

		expect(onIncomingMessage).not.toHaveBeenCalled();
		expect(entryFor(state, "a:1").data.unreadCount).toBe(1);
	});
});

describe("ConversationsState #syncLatest single-flight (P1.8)", () => {
	it("coalesces concurrent ensureLoaded into one page-1 fetch", async () => {
		getConversationsMock.mockResolvedValue({ entries: [], nextPage: null });
		const state = new ConversationsState({
			ourProfileId: OUR_ID,
			onIncomingMessage,
		});
		await settled(state);
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
		const state = new ConversationsState({
			ourProfileId: OUR_ID,
			onIncomingMessage,
		});
		await settled(state);
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
		const state = new ConversationsState({
			ourProfileId: OUR_ID,
			onIncomingMessage,
		});
		await settled(state);

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
		const state = new ConversationsState({
			ourProfileId: OUR_ID,
			onIncomingMessage,
		});
		await settled(state);
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
		const state = new ConversationsState({
			ourProfileId: OUR_ID,
			onIncomingMessage,
		});

		const reconcilePromise = reconcileHandlers[0]?.();
		await microtasks();

		getConversationsMock.mockRejectedValueOnce(new Error("network"));
		initGate.resolve({ entries: [conversation("a:1", 1000)], nextPage: 2 });
		await settled(state);
		await reconcilePromise;

		expect(state.entries.map((e) => e.data.conversationId)).toEqual([
			"a:1",
		]);
		expect(state.nextPage).toBe(2);
	});

	it("runs a reconcile asked for while another one is in flight", async () => {
		getConversationsMock.mockResolvedValueOnce({
			entries: [conversation("a:1", 1000)],
			nextPage: null,
		});
		const state = new ConversationsState({
			ourProfileId: OUR_ID,
			onIncomingMessage,
		});
		await settled(state);

		const gate = deferred<{
			entries: Conversation[];
			nextPage: number | null;
		}>();
		getConversationsMock.mockReturnValueOnce(gate.promise);
		const first = reconcileHandlers[0]?.();
		await microtasks();
		await reconcileHandlers[0]?.();

		expect(getConversationsMock).toHaveBeenCalledTimes(2);

		getConversationsMock.mockResolvedValueOnce({
			entries: [conversation("b:2", 3000)],
			nextPage: null,
		});
		gate.resolve({ entries: [conversation("a:1", 1000)], nextPage: null });
		await first;
		await vi.waitFor(() =>
			expect(getConversationsMock).toHaveBeenCalledTimes(3),
		);
		await vi.waitFor(() =>
			expect(state.entries.map((e) => e.data.conversationId)).toEqual([
				"b:2",
			]),
		);
	});

	it("discards a reconcile's stale writes when a loadMore supersedes it mid-paging", async () => {
		getConversationsMock.mockResolvedValueOnce({
			entries: [conversation("a:1", 1000)],
			nextPage: 2,
		});
		const state = new ConversationsState({
			ourProfileId: OUR_ID,
			onIncomingMessage,
		});
		await settled(state);
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
