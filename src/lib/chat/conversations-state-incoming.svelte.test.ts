import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	getConversationsMock,
	onIncomingMessage,
	currentPage,
	singleColumn,
	messageSentHandlers,
} = vi.hoisted(() => ({
	getConversationsMock: vi.fn(),
	onIncomingMessage: vi.fn(),
	currentPage: { route: { id: "/(protected)/chat" } },
	singleColumn: { current: false },
	messageSentHandlers: [] as ((event: unknown) => void)[],
}));

vi.mock("$app/state", () => ({ page: currentPage }));
vi.mock("$lib/api/error-toast", () => ({ showErrorToast: vi.fn() }));
vi.mock("$lib/api/messaging/conversations", () => ({
	getConversations: getConversationsMock,
	markConversationAsRead: vi.fn(() => Promise.resolve()),
	deleteConversationForMe: vi.fn(() => Promise.resolve()),
	setConversationPinned: vi.fn(() => Promise.resolve()),
	setConversationMuted: vi.fn(() => Promise.resolve()),
}));
vi.mock("$lib/util/breakpoints.svelte", () => ({ below: () => singleColumn }));
vi.mock("$lib/util/reconcile", () => ({
	reconciler: { subscribe: () => vi.fn() },
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
import {
	conversation,
	entryFor,
	fromPeer,
	microtasks,
	OUR_ID,
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
	messageSentHandlers.length = 0;
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
		const message = fromPeer("a:1", 2000);

		emitMessageSent(message);

		expect(onIncomingMessage).toHaveBeenCalledExactlyOnceWith({
			message,
			conversation: entryFor(state, "a:1"),
			inView: false,
		});
	});

	it("stays silent for a muted conversation", async () => {
		await stateAwayFromTheInbox({ muted: true });

		emitMessageSent(fromPeer("a:1", 2000));

		expect(onIncomingMessage).not.toHaveBeenCalled();
	});

	it("stays silent when the peer unsends a message this app never saw", async () => {
		await stateAwayFromTheInbox();

		emitMessageSent({ ...fromPeer("a:1", 2000), unsent: true });
		await microtasks();

		expect(onIncomingMessage).not.toHaveBeenCalled();
	});

	it("hands the message over as in view while the conversations list is on screen", async () => {
		const state = await stateAwayFromTheInbox();
		currentPage.route.id = "/(protected)/chat";
		onIncomingMessage.mockClear();

		emitMessageSent(fromPeer("a:1", 2000));
		await microtasks();

		expect(onIncomingMessage).toHaveBeenCalledExactlyOnceWith(
			expect.objectContaining({ inView: true }),
		);
		expect(entryFor(state, "a:1").data.unreadCount).toBe(1);
	});
});

describe("ConversationsState open chat ownership", () => {
	let latestTimestamp = 2000;

	async function inboxHiddenBehindAChat() {
		currentPage.route.id = "/(protected)/chat/[conversationId]";
		singleColumn.current = true;
		getConversationsMock.mockResolvedValue({
			entries: [conversation("a:1", 1000), conversation("b:2", 1000)],
			nextPage: null,
		});
		const state = new ConversationsState({
			ourProfileId: OUR_ID,
			onIncomingMessage,
		});
		await settled(state);
		return state;
	}

	async function arrivesInView(conversationId: string): Promise<boolean> {
		latestTimestamp += 1000;
		emitMessageSent(fromPeer(conversationId, latestTimestamp));
		await microtasks();
		return onIncomingMessage.mock.lastCall?.[0].inView;
	}

	it("keeps a chat open when an earlier owner of the same chat lets go", async () => {
		const state = await inboxHiddenBehindAChat();
		const releaseFirst = state.setActive("a:1");
		state.setActive("a:1");

		releaseFirst();

		expect(await arrivesInView("a:1")).toBe(true);
		expect(await arrivesInView("b:2")).toBe(false);
	});

	it("closes a chat once its latest owner lets go", async () => {
		const state = await inboxHiddenBehindAChat();
		const releaseFirst = state.setActive("a:1");
		const releaseSecond = state.setActive("a:1");
		releaseFirst();
		expect(await arrivesInView("a:1")).toBe(true);

		releaseSecond();

		expect(await arrivesInView("a:1")).toBe(false);
	});

	it("keeps the newly opened chat when the previous one lets go", async () => {
		const state = await inboxHiddenBehindAChat();
		const releasePrevious = state.setActive("a:1");
		state.setActive("b:2");

		releasePrevious();

		expect(await arrivesInView("b:2")).toBe(true);
		expect(await arrivesInView("a:1")).toBe(false);
	});
});
