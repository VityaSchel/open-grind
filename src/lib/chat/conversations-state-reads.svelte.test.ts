import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getConversationsMock, onConversationRead, onFetchedReads, wsHandlers } =
	vi.hoisted(() => ({
		getConversationsMock: vi.fn(),
		onConversationRead: vi.fn(),
		onFetchedReads: vi.fn<(conversationIds: string[]) => void>(),
		wsHandlers: new Map<string, (event: unknown) => void>(),
	}));

vi.mock("$app/state", () => ({ page: { route: { id: "/(protected)/chat" } } }));
vi.mock("$lib/api/error-toast", () => ({ showErrorToast: vi.fn() }));
vi.mock("$lib/api/messaging/conversations", () => ({
	getConversations: getConversationsMock,
	markConversationAsRead: vi.fn(() => Promise.resolve()),
	deleteConversationForMe: vi.fn(() => Promise.resolve()),
	setConversationPinned: vi.fn(() => Promise.resolve()),
	setConversationMuted: vi.fn(() => Promise.resolve()),
}));
vi.mock("$lib/util/breakpoints.svelte", () => ({
	below: () => ({ current: false }),
}));
vi.mock("$lib/util/reconcile", () => ({
	reconciler: { subscribe: () => vi.fn() },
}));
vi.mock("$lib/ws.svelte", async (importOriginal) => ({
	...(await importOriginal<typeof import("$lib/ws.svelte")>()),
	ws: {
		on(eventType: string, _schema: unknown, handler: (e: unknown) => void) {
			wsHandlers.set(eventType, handler);
			return Promise.resolve(vi.fn());
		},
	},
}));

import { ConversationsState } from "./conversations-state.svelte";
import {
	conversation,
	deferred,
	entryFor,
	fromPeer,
	microtasks,
	OUR_ID,
	PEER_ID,
	settled,
} from "./conversations-test-helpers";

const CHAT = "1:2";
const states: ConversationsState[] = [];

function page(entries: ReturnType<typeof conversation>[]) {
	return { entries, nextPage: null };
}

async function stateWithUnread(unreadCount: number) {
	getConversationsMock.mockResolvedValue(
		page([conversation(CHAT, 1000, { unreadCount })]),
	);
	const state = new ConversationsState({
		ourProfileId: OUR_ID,
		onIncomingMessage: vi.fn(),
		onConversationRead,
		onFetchedReads,
	});
	states.push(state);
	await settled(state);
	onConversationRead.mockClear();
	onFetchedReads.mockClear();
	return state;
}

function refreshWith(
	state: ConversationsState,
	{ unreadCount, at = 1000 }: { unreadCount: number; at?: number },
) {
	getConversationsMock.mockResolvedValue(
		page([conversation(CHAT, at, { unreadCount })]),
	);
	return state.refresh();
}

function fetchedReads(): string[] {
	return onFetchedReads.mock.calls.flatMap(([ids]) => ids);
}

function emitRead({
	profileId,
	timestamp = 2000,
}: {
	profileId: number;
	timestamp?: number;
}) {
	wsHandlers.get("chat.v1.conversation_read")?.({
		payload: { conversationId: CHAT, profileId, timestamp },
	});
}

function focusWindow({ focused }: { focused: boolean }) {
	vi.spyOn(document, "hasFocus").mockReturnValue(focused);
	vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
	window.dispatchEvent(new Event(focused ? "focus" : "blur"));
}

beforeEach(() => {
	vi.clearAllMocks();
	localStorage.clear();
	wsHandlers.clear();
});

afterEach(async () => {
	vi.restoreAllMocks();
	await Promise.all(states.splice(0).map((state) => state.destroy()));
});

describe("ConversationsState reports chats that became read", () => {
	it("reports a chat when it is opened", async () => {
		const state = await stateWithUnread(2);

		state.setActive(CHAT);

		expect(onConversationRead).toHaveBeenCalledExactlyOnceWith(CHAT);
	});

	it("reports read chats from the first page it loads", async () => {
		getConversationsMock.mockResolvedValue(
			page([conversation(CHAT, 1000, { unreadCount: 0 })]),
		);
		const state = new ConversationsState({
			ourProfileId: OUR_ID,
			onIncomingMessage: vi.fn(),
			onFetchedReads,
		});
		states.push(state);
		await settled(state);

		expect(fetchedReads()).toEqual([CHAT]);
	});

	it("reports a chat read on another device once a refresh shows nothing unread", async () => {
		const state = await stateWithUnread(2);

		await refreshWith(state, { unreadCount: 0 });

		expect(fetchedReads()).toEqual([CHAT]);
		expect(entryFor(state, CHAT).data.unreadCount).toBe(0);
	});

	it("reports a read chat even when this client never counted its messages", async () => {
		const state = await stateWithUnread(0);

		await refreshWith(state, { unreadCount: 0, at: 2000 });

		expect(fetchedReads()).toEqual([CHAT]);
	});

	it("does not report a refresh that still shows unread messages", async () => {
		const state = await stateWithUnread(2);

		await refreshWith(state, { unreadCount: 3 });

		expect(fetchedReads()).not.toContain(CHAT);
	});

	it("does not take a snapshot older than a message the socket delivered as a read", async () => {
		const state = await stateWithUnread(0);
		const snapshot = deferred<ReturnType<typeof page>>();
		getConversationsMock.mockReturnValue(snapshot.promise);
		const refreshing = state.refresh();

		wsHandlers.get("chat.v1.message_sent")?.({
			payload: fromPeer(CHAT, 2000),
		});
		await microtasks();
		snapshot.resolve(page([conversation(CHAT, 1000, { unreadCount: 0 })]));
		await refreshing;

		expect(fetchedReads()).not.toContain(CHAT);
	});

	it("reports a chat that dropped out of the refreshed window", async () => {
		const state = await stateWithUnread(2);
		getConversationsMock.mockResolvedValue(page([]));

		await state.refresh();

		expect(fetchedReads()).toEqual([CHAT]);
	});

	it("does not report a chat an online-only window dropped", async () => {
		const state = await stateWithUnread(2);
		state.setFilters({ online: true });
		await settled(state);
		onFetchedReads.mockClear();
		getConversationsMock.mockResolvedValue(page([]));

		await state.refresh();

		expect(fetchedReads()).not.toContain(CHAT);
	});

	it("reports a chat an unread-only window dropped", async () => {
		const state = await stateWithUnread(2);
		state.setFilters({ unread: true });
		await settled(state);
		onFetchedReads.mockClear();
		getConversationsMock.mockResolvedValue(page([]));

		await state.refresh();

		expect(fetchedReads()).toEqual([CHAT]);
	});

	it("does not report a chat dropped by a refresh that started before its newest message", async () => {
		const state = await stateWithUnread(2);
		const snapshot = deferred<ReturnType<typeof page>>();
		getConversationsMock.mockReturnValue(snapshot.promise);
		const fetchesBefore = getConversationsMock.mock.calls.length;
		const refreshing = state.refresh();
		await vi.waitFor(() =>
			expect(getConversationsMock.mock.calls.length).toBeGreaterThan(
				fetchesBefore,
			),
		);

		wsHandlers.get("chat.v1.message_sent")?.({
			payload: fromPeer(CHAT, 3000),
		});
		await microtasks();
		snapshot.resolve(page([]));
		await refreshing;

		expect(fetchedReads()).not.toContain(CHAT);
	});

	it("keeps doubting stale snapshots after one of them overwrote the chat", async () => {
		const state = await stateWithUnread(0);
		for (let round = 0; round < 2; round += 1) {
			const snapshot = deferred<ReturnType<typeof page>>();
			getConversationsMock.mockReturnValue(snapshot.promise);
			const refreshing = state.refresh();
			if (round === 0)
				wsHandlers.get("chat.v1.message_sent")?.({
					payload: fromPeer(CHAT, 2000),
				});
			await microtasks();
			snapshot.resolve(
				page([conversation(CHAT, 1000, { unreadCount: 0 })]),
			);
			await refreshing;
		}

		expect(fetchedReads()).not.toContain(CHAT);
	});

	it("reports our own reads from the websocket and clears the unread count", async () => {
		const state = await stateWithUnread(2);

		emitRead({ profileId: OUR_ID });

		expect(onConversationRead).toHaveBeenCalledExactlyOnceWith(CHAT);
		expect(entryFor(state, CHAT).data.unreadCount).toBe(0);
	});

	it("ignores our own read that predates the chat's newest message", async () => {
		const state = await stateWithUnread(2);

		emitRead({ profileId: OUR_ID, timestamp: 500 });

		expect(onConversationRead).not.toHaveBeenCalled();
		expect(entryFor(state, CHAT).data.unreadCount).toBe(2);
	});

	it("ignores our own read of the open chat while the window is away", async () => {
		const state = await stateWithUnread(0);
		focusWindow({ focused: false });
		state.setActive(CHAT);
		onConversationRead.mockClear();

		emitRead({ profileId: OUR_ID });

		expect(onConversationRead).not.toHaveBeenCalled();
	});

	it("ignores a peer's read receipt", async () => {
		const state = await stateWithUnread(2);

		emitRead({ profileId: PEER_ID });

		expect(onConversationRead).not.toHaveBeenCalled();
		expect(entryFor(state, CHAT).data.unreadCount).toBe(2);
	});

	it("reports the open chat again when the app comes back into focus", async () => {
		const state = await stateWithUnread(0);
		focusWindow({ focused: false });
		state.setActive(CHAT);
		await microtasks();
		onConversationRead.mockClear();

		focusWindow({ focused: true });

		await vi.waitFor(() =>
			expect(onConversationRead).toHaveBeenCalledExactlyOnceWith(CHAT),
		);
	});

	it("reports nothing on focus while no chat is open", async () => {
		const state = await stateWithUnread(0);
		focusWindow({ focused: false });
		const closeChat = state.setActive(CHAT);
		closeChat();
		await microtasks();
		onConversationRead.mockClear();

		focusWindow({ focused: true });
		await microtasks();

		expect(onConversationRead).not.toHaveBeenCalled();
	});
});
