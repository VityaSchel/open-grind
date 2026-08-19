import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	getConversationsMock,
	markConversationAsReadMock,
	setConversationPinnedMock,
	setConversationMutedMock,
	showErrorToastMock,
	onIncomingMessage,
	currentPage,
	singleColumn,
	reconcileHandlers,
	messageSentHandlers,
	conversationDeleteHandlers,
} = vi.hoisted(() => ({
	getConversationsMock: vi.fn(),
	markConversationAsReadMock: vi.fn(() => Promise.resolve()),
	setConversationPinnedMock: vi.fn(() => Promise.resolve()),
	setConversationMutedMock: vi.fn(() => Promise.resolve()),
	showErrorToastMock: vi.fn(),
	onIncomingMessage: vi.fn(),
	currentPage: { route: { id: "/(protected)/chat" } },
	singleColumn: { current: false },
	reconcileHandlers: [] as (() => void | Promise<void>)[],
	messageSentHandlers: [] as ((event: unknown) => void)[],
	conversationDeleteHandlers: [] as ((event: unknown) => void)[],
}));

vi.mock("$app/state", () => ({ page: currentPage }));
vi.mock("$lib/api/error-toast", () => ({ showErrorToast: showErrorToastMock }));
vi.mock("$lib/api/messaging/conversations", () => ({
	getConversations: getConversationsMock,
	markConversationAsRead: markConversationAsReadMock,
	deleteConversationForMe: vi.fn(() => Promise.resolve()),
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
			if (eventType === "chat.v1.conversation.delete")
				conversationDeleteHandlers.push(handler);
			return Promise.resolve(vi.fn());
		},
	},
}));

import type { Conversation } from "$lib/model/messaging/conversations";
import { ConversationsState } from "./conversations-state.svelte";
import {
	conversation,
	deferred,
	entryFor,
	incomingMessage,
	microtasks,
	OUR_ID,
	PEER_ID,
	settled,
} from "./conversations-test-helpers";

function emitMessageSent(payload: unknown) {
	messageSentHandlers[0]?.({ payload });
}

beforeEach(() => {
	vi.clearAllMocks();
	localStorage.clear();
	currentPage.route.id = "/(protected)/chat";
	singleColumn.current = false;
	reconcileHandlers.length = 0;
	messageSentHandlers.length = 0;
	conversationDeleteHandlers.length = 0;
});

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

describe("ConversationsState unread accounting", () => {
	async function inboxWith(entries: Conversation[]) {
		getConversationsMock.mockResolvedValue({ entries, nextPage: null });
		const state = new ConversationsState({
			ourProfileId: OUR_ID,
			onIncomingMessage,
		});
		await settled(state);
		return state;
	}

	it("keeps the dot lit for a message arriving after the list was viewed", async () => {
		const state = await inboxWith([
			conversation("a:1", 2000, { unreadCount: 1 }),
		]);
		state.noteListViewed();
		expect(state.hasUnread).toBe(false);

		emitMessageSent(incomingMessage("a:1", 2500, PEER_ID));
		await microtasks();

		expect(entryFor(state, "a:1").data.unreadCount).toBe(2);
		expect(state.hasUnread).toBe(true);
	});

	it("counts a reply the row's clock has already passed", async () => {
		const state = await inboxWith([conversation("a:1", 5000)]);

		emitMessageSent(incomingMessage("a:1", 2000, PEER_ID));
		await microtasks();

		expect(entryFor(state, "a:1").data.unreadCount).toBe(1);
	});

	it("leaves the newer preview alone when an out-of-order message arrives", async () => {
		const state = await inboxWith([conversation("a:1", 5000)]);

		emitMessageSent(incomingMessage("a:1", 2000, PEER_ID));
		await microtasks();

		const entry = entryFor(state, "a:1");
		expect(entry.data.unreadCount).toBe(1);
		expect(entry.data.lastActivityTimestamp).toBe(5000);
		expect(entry.data.preview).toBeNull();
	});

	it("counts two messages sharing a millisecond separately", async () => {
		const state = await inboxWith([conversation("a:1", 1000)]);

		emitMessageSent({
			...incomingMessage("a:1", 2000, PEER_ID),
			messageId: "m-first",
		});
		emitMessageSent({
			...incomingMessage("a:1", 2000, PEER_ID),
			messageId: "m-second",
		});
		await microtasks();

		expect(entryFor(state, "a:1").data.unreadCount).toBe(2);
	});

	it("counts a repeated delivery of the same message once", async () => {
		const state = await inboxWith([conversation("a:1", 1000)]);
		const message = incomingMessage("a:1", 2000, PEER_ID);

		emitMessageSent(message);
		emitMessageSent(message);
		await microtasks();

		const entry = entryFor(state, "a:1");
		expect(entry.data.unreadCount).toBe(1);
		expect(entry.data.lastActivityTimestamp).toBe(2000);
	});

	it("ignores our own message when counting unread", async () => {
		const state = await inboxWith([conversation("a:1", 5000)]);

		emitMessageSent(incomingMessage("a:1", 2000, OUR_ID));
		await microtasks();

		expect(entryFor(state, "a:1").data.unreadCount).toBe(0);
	});

	it("badges a conversation the inbox had not loaded yet", async () => {
		const state = await inboxWith([conversation("a:1", 1000)]);
		getConversationsMock.mockResolvedValue({
			entries: [conversation("b:2", 3000), conversation("a:1", 1000)],
			nextPage: null,
		});

		emitMessageSent(incomingMessage("b:2", 3000, PEER_ID));

		await vi.waitFor(() =>
			expect(entryFor(state, "b:2").data.unreadCount).toBe(1),
		);
	});

	it("counts every arrival that lands while the conversation is missing", async () => {
		const state = await inboxWith([conversation("a:1", 1000)]);
		const gate = deferred<{
			entries: Conversation[];
			nextPage: number | null;
		}>();
		getConversationsMock.mockReturnValueOnce(gate.promise);

		for (const timestamp of [3000, 3001, 3002]) {
			emitMessageSent(incomingMessage("b:2", timestamp, PEER_ID));
		}
		await microtasks();
		gate.resolve({
			entries: [conversation("b:2", 3002), conversation("a:1", 1000)],
			nextPage: null,
		});

		await vi.waitFor(() =>
			expect(entryFor(state, "b:2").data.unreadCount).toBe(3),
		);
	});

	it("badges a conversation the sync it joined was too early to return", async () => {
		const state = await inboxWith([conversation("a:1", 1000)]);
		const stale = deferred<{
			entries: Conversation[];
			nextPage: number | null;
		}>();
		getConversationsMock.mockReturnValueOnce(stale.promise);
		const joined = state.ensureLoaded("c:3");

		emitMessageSent(incomingMessage("b:2", 3000, PEER_ID));

		getConversationsMock.mockResolvedValue({
			entries: [conversation("b:2", 3000), conversation("a:1", 1000)],
			nextPage: null,
		});
		stale.resolve({ entries: [conversation("a:1", 1000)], nextPage: null });
		await joined;

		await vi.waitFor(() =>
			expect(entryFor(state, "b:2").data.unreadCount).toBe(1),
		);
	});

	it("counts a message again when the sync that would have placed it failed", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		const state = await inboxWith([conversation("a:1", 1000)]);
		getConversationsMock.mockRejectedValueOnce(new Error("offline"));
		const message = incomingMessage("b:2", 3000, PEER_ID);

		emitMessageSent(message);
		await vi.waitFor(() => expect(showErrorToastMock).toHaveBeenCalled());

		getConversationsMock.mockResolvedValue({
			entries: [conversation("b:2", 3000), conversation("a:1", 1000)],
			nextPage: null,
		});
		emitMessageSent(message);

		await vi.waitFor(() =>
			expect(entryFor(state, "b:2").data.unreadCount).toBe(1),
		);
		vi.restoreAllMocks();
	});

	it("surfaces one toast and one fetch when the sync keeps failing", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		const state = await inboxWith([conversation("a:1", 1000)]);
		getConversationsMock.mockClear();
		getConversationsMock.mockRejectedValue(new Error("offline"));

		emitMessageSent(incomingMessage("b:2", 3000, PEER_ID));
		await vi.waitFor(() => expect(showErrorToastMock).toHaveBeenCalled());
		await microtasks();

		expect(showErrorToastMock).toHaveBeenCalledOnce();
		expect(getConversationsMock).toHaveBeenCalledOnce();
		expect(state.entries).toHaveLength(1);
		getConversationsMock.mockReset();
		vi.restoreAllMocks();
	});

	it("syncs twice, quietly, when the first sync was one it joined", async () => {
		const state = await inboxWith([conversation("a:1", 1000)]);
		const stale = deferred<{
			entries: Conversation[];
			nextPage: number | null;
		}>();
		getConversationsMock.mockClear();
		getConversationsMock.mockReturnValueOnce(stale.promise);
		const joined = state.ensureLoaded("c:3");

		emitMessageSent(incomingMessage("b:2", 3000, PEER_ID));

		getConversationsMock.mockResolvedValue({
			entries: [conversation("b:2", 3000), conversation("a:1", 1000)],
			nextPage: null,
		});
		stale.resolve({ entries: [conversation("a:1", 1000)], nextPage: null });
		await joined;
		await vi.waitFor(() => expect(state.entries).toHaveLength(2));
		await microtasks();

		expect(entryFor(state, "b:2").data.unreadCount).toBe(1);
		expect(getConversationsMock).toHaveBeenCalledTimes(2);
		expect(showErrorToastMock).not.toHaveBeenCalled();
	});

	it("leaves no badge on a conversation opened while its sync was in flight", async () => {
		const state = await inboxWith([conversation("a:1", 1000)]);
		currentPage.route.id = "/(protected)/(navbar)";
		singleColumn.current = true;
		const gate = deferred<{
			entries: Conversation[];
			nextPage: number | null;
		}>();
		getConversationsMock.mockReturnValueOnce(gate.promise);

		emitMessageSent(incomingMessage("b:2", 3000, PEER_ID));
		state.setActive("b:2");
		gate.resolve({
			entries: [conversation("b:2", 3000), conversation("a:1", 1000)],
			nextPage: null,
		});

		await vi.waitFor(() => expect(state.entries).toHaveLength(2));
		await microtasks();

		expect(entryFor(state, "b:2").data.unreadCount).toBe(0);
		expect(onIncomingMessage).not.toHaveBeenCalled();
	});

	it("keeps the server count for a conversation the inbox had not loaded yet", async () => {
		const state = await inboxWith([conversation("a:1", 1000)]);
		getConversationsMock.mockResolvedValue({
			entries: [
				conversation("b:2", 3000, { unreadCount: 4 }),
				conversation("a:1", 1000),
			],
			nextPage: null,
		});

		emitMessageSent(incomingMessage("b:2", 3000, PEER_ID));

		await vi.waitFor(() =>
			expect(entryFor(state, "b:2").data.unreadCount).toBe(4),
		);
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
		const loadPromise = state.paging.run();

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
		await state.paging.run();
		expect(state.nextPage).toBe(5);

		reconcileGate.resolve({
			entries: [conversation("a:1", 1000)],
			nextPage: null,
		});
		await reconcilePromise;

		expect(state.nextPage).toBe(5);
	});
});

describe("ConversationsState paging failures", () => {
	async function inboxWithASecondPage() {
		vi.spyOn(console, "error").mockImplementation(() => {});
		getConversationsMock.mockResolvedValueOnce({
			entries: [conversation("a:1", 1000)],
			nextPage: 2,
		});
		const state = new ConversationsState({
			ourProfileId: OUR_ID,
			onIncomingMessage: vi.fn(),
		});
		await settled(state);
		return state;
	}

	it("surfaces a failed follow-up page in state, not a vanishing toast", async () => {
		const state = await inboxWithASecondPage();
		getConversationsMock.mockRejectedValueOnce(new Error("offline"));

		await state.paging.run();

		expect(state.paging.failure).toEqual(new Error("offline"));
		expect(state.paging.running).toBe(false);
		expect(showErrorToastMock).not.toHaveBeenCalledWith(
			expect.objectContaining({
				label: "Failed to load more conversations",
			}),
		);
	});

	it("keeps a displayed paging failure through a failed refresh", async () => {
		const state = await inboxWithASecondPage();
		getConversationsMock.mockRejectedValueOnce(new Error("offline"));
		await state.paging.run();
		const wedged = state.paging.armToken;
		expect(state.paging.failure).not.toBeNull();

		getConversationsMock.mockRejectedValueOnce(new Error("still offline"));
		await reconcileHandlers[0]?.();

		expect(state.paging.failure).not.toBeNull();
		expect(state.paging.armToken).toBe(wedged);
	});

	it("re-arms after a failed refresh when nothing is on display", async () => {
		const state = await inboxWithASecondPage();
		const before = state.paging.armToken;

		getConversationsMock.mockRejectedValueOnce(new Error("offline"));
		await reconcileHandlers[0]?.();

		expect(state.paging.armToken).not.toBe(before);
	});

	it("re-arms paging once a refresh finishes", async () => {
		const state = await inboxWithASecondPage();
		getConversationsMock.mockRejectedValueOnce(new Error("offline"));
		await state.paging.run();
		const wedged = state.paging.armToken;
		expect(state.paging.failure).not.toBeNull();

		getConversationsMock.mockResolvedValue({
			entries: [conversation("a:1", 1000)],
			nextPage: null,
		});
		await reconcileHandlers[0]?.();

		expect(state.paging.failure).toBeNull();
		expect(state.paging.armToken).not.toBe(wedged);
	});
});
