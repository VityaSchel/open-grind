import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
	getConversationsMock,
	invokeMock,
	markConversationAsRead,
	onConversationRead,
	wsHandlers,
} = vi.hoisted(() => ({
	getConversationsMock: vi.fn(),
	invokeMock: vi.fn<(command: string) => Promise<unknown>>(),
	markConversationAsRead: vi.fn(() => Promise.resolve()),
	onConversationRead: vi.fn(),
	wsHandlers: new Map<string, (event: unknown) => void>(),
}));

vi.mock("$app/state", () => ({ page: { route: { id: "/(protected)/chat" } } }));
vi.mock("@tauri-apps/api/core", async (importOriginal) => ({
	...(await importOriginal<typeof import("@tauri-apps/api/core")>()),
	invoke: invokeMock,
}));
vi.mock("$lib/api/error-toast", () => ({ showErrorToast: vi.fn() }));
vi.mock("$lib/api/messaging/conversations", () => ({
	getConversations: getConversationsMock,
	markConversationAsRead,
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

import { requestInboxResync } from "$lib/chat/inbox-resync";
import { whileOpeningPushDeeplink } from "$lib/push/opening-deeplink";
import { ConversationsState } from "./conversations-state.svelte";
import {
	conversation,
	deferred,
	entryFor,
	fromPeer,
	microtasks,
	OUR_ID,
	settled,
} from "./conversations-test-helpers";

const CHAT = "1:2";
const states: ConversationsState[] = [];

function page(unreadCount: number, at = 1000) {
	return {
		entries: [conversation(CHAT, at, { unreadCount })],
		nextPage: null,
	};
}

function focusWindow({ focused }: { focused: boolean }) {
	vi.spyOn(document, "hasFocus").mockReturnValue(focused);
	vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
	window.dispatchEvent(new Event(focused ? "focus" : "blur"));
}

async function openChat({ focused }: { focused: boolean }) {
	getConversationsMock.mockResolvedValue(page(0));
	const state = new ConversationsState({
		ourProfileId: OUR_ID,
		onIncomingMessage: vi.fn(),
		onConversationRead,
	});
	states.push(state);
	await settled(state);
	focusWindow({ focused });
	const closeChat = state.setActive(CHAT);
	markConversationAsRead.mockClear();
	onConversationRead.mockClear();
	return { state, closeChat };
}

async function receive(timestamp: number, { unsent = false } = {}) {
	wsHandlers.get("chat.v1.message_sent")?.({
		payload: { ...fromPeer(CHAT, timestamp), unsent },
	});
	await microtasks();
}

function newState() {
	const state = new ConversationsState({
		ourProfileId: OUR_ID,
		onIncomingMessage: vi.fn(),
		onConversationRead,
	});
	states.push(state);
	return state;
}

beforeEach(() => {
	vi.clearAllMocks();
	localStorage.clear();
	wsHandlers.clear();
	invokeMock.mockRejectedValue(new Error("no native side"));
});

afterEach(async () => {
	vi.restoreAllMocks();
	await Promise.all(states.splice(0).map((state) => state.destroy()));
});

describe("ConversationsState reads the open chat only while it is seen", () => {
	it("marks a message read on the server when it arrives in the chat on screen", async () => {
		const { state } = await openChat({ focused: true });

		await receive(2000);

		expect(markConversationAsRead).toHaveBeenCalledExactlyOnceWith({
			conversationId: CHAT,
		});
		expect(entryFor(state, CHAT).data.unreadCount).toBe(0);
	});

	it("counts a message that arrives while the window is away and reads it on return", async () => {
		const { state } = await openChat({ focused: false });

		await receive(2000);
		expect(entryFor(state, CHAT).data.unreadCount).toBe(1);
		expect(markConversationAsRead).not.toHaveBeenCalled();

		focusWindow({ focused: true });

		await vi.waitFor(() =>
			expect(markConversationAsRead).toHaveBeenCalledExactlyOnceWith({
				conversationId: CHAT,
			}),
		);
		expect(entryFor(state, CHAT).data.unreadCount).toBe(0);
		expect(onConversationRead).toHaveBeenCalledExactlyOnceWith(CHAT);
	});

	it("reads the open chat on the server when a refresh shows it unread", async () => {
		const { state } = await openChat({ focused: true });
		getConversationsMock.mockResolvedValue(page(2, 2000));

		await state.refresh();

		expect(markConversationAsRead).toHaveBeenCalledExactlyOnceWith({
			conversationId: CHAT,
		});
		expect(entryFor(state, CHAT).data.unreadCount).toBe(0);
	});

	it("keeps the server count of the open chat while the window is away", async () => {
		const { state } = await openChat({ focused: false });
		getConversationsMock.mockResolvedValue(page(2, 2000));

		await state.refresh();

		expect(markConversationAsRead).not.toHaveBeenCalled();
		expect(entryFor(state, CHAT).data.unreadCount).toBe(2);
	});
});

describe("ConversationsState reads the open chat it could not see yet", () => {
	it("reads a chat opened before the first inbox page arrived", async () => {
		focusWindow({ focused: true });
		const firstPage = deferred<ReturnType<typeof page>>();
		getConversationsMock.mockReturnValueOnce(firstPage.promise);
		const state = newState();

		state.setActive(CHAT);
		markConversationAsRead.mockClear();
		firstPage.resolve(page(1, 2000));
		await settled(state);

		expect(markConversationAsRead).toHaveBeenCalledExactlyOnceWith({
			conversationId: CHAT,
		});
		expect(entryFor(state, CHAT).data.unreadCount).toBe(0);
	});

	it("reads the open chat when an inbox resync shows it unread", async () => {
		const { state } = await openChat({ focused: true });
		getConversationsMock.mockResolvedValue(page(2, 2000));

		requestInboxResync();

		await vi.waitFor(() =>
			expect(entryFor(state, CHAT).data.unreadCount).toBe(0),
		);
		expect(markConversationAsRead).toHaveBeenCalledExactlyOnceWith({
			conversationId: CHAT,
		});
	});

	it("reads an open chat that the inbox filters hide once per new message", async () => {
		focusWindow({ focused: true });
		getConversationsMock.mockResolvedValue({ entries: [], nextPage: null });
		const state = newState();
		await settled(state);

		state.setActive(CHAT);
		await microtasks();
		expect(markConversationAsRead).toHaveBeenCalledExactlyOnceWith({
			conversationId: CHAT,
		});

		markConversationAsRead.mockClear();
		await receive(2000);
		await vi.waitFor(() =>
			expect(markConversationAsRead).toHaveBeenCalledOnce(),
		);
		await state.refresh();
		expect(markConversationAsRead).toHaveBeenCalledOnce();
	});

	it("does not count an unsent message as unread", async () => {
		const { state } = await openChat({ focused: false });

		await receive(2000, { unsent: true });

		expect(entryFor(state, CHAT).data.unreadCount).toBe(0);
		expect(markConversationAsRead).not.toHaveBeenCalled();
	});

	it("does not count an unsent message for a chat the inbox has not loaded", async () => {
		getConversationsMock.mockResolvedValue({ entries: [], nextPage: null });
		const state = newState();
		await settled(state);
		getConversationsMock.mockResolvedValue(page(0, 2000));

		await receive(2000, { unsent: true });

		await vi.waitFor(() => expect(state.entries).toHaveLength(1));
		expect(entryFor(state, CHAT).data.unreadCount).toBe(0);
	});

	it("does not give back a count that a newer refresh replaced when a read fails", async () => {
		const { state } = await openChat({ focused: true });
		const firstRead = deferred<void>();
		markConversationAsRead.mockReturnValueOnce(firstRead.promise);
		getConversationsMock.mockResolvedValue(page(2, 2000));

		await state.refresh();
		await state.refresh();
		firstRead.reject(new Error("offline"));

		await vi.waitFor(() =>
			expect(entryFor(state, CHAT).data.unreadCount).toBe(2),
		);
		await microtasks();
		expect(entryFor(state, CHAT).data.unreadCount).toBe(2);
	});
});

describe("ConversationsState and notifications that open a chat", () => {
	it("leaves the open chat unread when another chat's notification brings the window back", async () => {
		const { state, closeChat } = await openChat({ focused: false });
		await receive(2000);

		await whileOpeningPushDeeplink(() => {
			focusWindow({ focused: true });
			closeChat();
			return Promise.resolve();
		});

		expect(markConversationAsRead).not.toHaveBeenCalled();
		expect(onConversationRead).not.toHaveBeenCalledWith(CHAT);
		expect(entryFor(state, CHAT).data.unreadCount).toBe(1);
	});

	it("leaves the open chat alone while a tapped notification waits on the native side", async () => {
		const { state } = await openChat({ focused: false });
		await receive(2000);
		invokeMock.mockResolvedValue(true);

		focusWindow({ focused: true });
		await microtasks();

		expect(invokeMock).toHaveBeenCalledWith("push_deeplink_pending");
		expect(markConversationAsRead).not.toHaveBeenCalled();
		expect(onConversationRead).not.toHaveBeenCalled();
		expect(entryFor(state, CHAT).data.unreadCount).toBe(1);
	});

	it("reads the open chat once its own notification has opened it", async () => {
		const { state } = await openChat({ focused: false });
		await receive(2000);

		await whileOpeningPushDeeplink(() => {
			focusWindow({ focused: true });
			expect(markConversationAsRead).not.toHaveBeenCalled();
			return Promise.resolve();
		});

		expect(markConversationAsRead).toHaveBeenCalledExactlyOnceWith({
			conversationId: CHAT,
		});
		expect(onConversationRead).toHaveBeenCalledWith(CHAT);
		expect(entryFor(state, CHAT).data.unreadCount).toBe(0);
	});
});
