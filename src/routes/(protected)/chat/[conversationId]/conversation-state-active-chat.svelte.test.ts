import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getConversationsMock, getConversationMock } = vi.hoisted(() => ({
	getConversationsMock: vi.fn(),
	getConversationMock: vi.fn(),
}));

vi.mock("$app/state", () => ({
	page: { route: { id: "/(protected)/chat/[conversationId]" } },
}));
vi.mock("$lib/api/error-toast", () => ({ showErrorToast: vi.fn() }));
vi.mock("$lib/api/messaging/conversations", () => ({
	getConversations: getConversationsMock,
	markConversationAsRead: vi.fn(() => Promise.resolve()),
	deleteConversationForMe: vi.fn(() => Promise.resolve()),
	setConversationPinned: vi.fn(() => Promise.resolve()),
	setConversationMuted: vi.fn(() => Promise.resolve()),
}));
vi.mock("$lib/app-data/preferences.svelte", () => ({
	getPreferences: () => Promise.resolve({ revealMessageRead: true }),
}));
vi.mock("$lib/util/breakpoints.svelte", () => ({
	below: () => ({ current: true }),
}));
vi.mock("$lib/util/reconcile", () => ({
	reconciler: { subscribe: () => vi.fn() },
}));
vi.mock("$lib/ws.svelte", async (importOriginal) => ({
	...(await importOriginal<typeof import("$lib/ws.svelte")>()),
	ws: { on: () => Promise.resolve(vi.fn()) },
}));
vi.mock("./messages", () => ({ getConversation: getConversationMock }));

import { ConversationsState } from "$lib/chat/conversations-state.svelte";
import {
	conversation,
	fromPeer,
	microtasks,
	OUR_ID,
	PEER_ID,
	settled,
} from "$lib/chat/conversations-test-helpers";
import { ConversationState } from "./conversation-state.svelte";

const CHAT = "1:2";

const profile = {
	distance: null,
	mediaHash: null,
	name: "Peer",
	onlineUntil: null,
	profileId: PEER_ID,
	showDistance: false,
};

let conversations: ConversationsState;
const chats: ConversationState[] = [];

beforeEach(async () => {
	vi.clearAllMocks();
	localStorage.clear();
	getConversationsMock.mockResolvedValue({
		entries: [conversation(CHAT, 1000)],
		nextPage: null,
	});
	getConversationMock.mockResolvedValue({
		messages: [fromPeer(CHAT, 1000)],
		profile,
		pageKey: null,
		lastReadTimestamp: null,
	});
	conversations = new ConversationsState({
		ourProfileId: OUR_ID,
		onIncomingMessage: vi.fn(),
	});
	await settled(conversations);
});

afterEach(async () => {
	for (const chat of chats.splice(0)) chat.destroy();
	await conversations.destroy();
});

async function openChat(): Promise<ConversationState> {
	const chat = new ConversationState({
		conversationId: CHAT,
		ourProfileId: OUR_ID,
		conversations,
	});
	chats.push(chat);
	await microtasks();
	return chat;
}

async function messagesSurviveInboxRefresh(): Promise<boolean> {
	await conversations.refresh();
	return conversations.getCachedConversation(CHAT) !== undefined;
}

describe("ConversationState rebuilt for the same chat", () => {
	it("keeps the chat open when the replacement opens before the old one is torn down", async () => {
		const outgoing = await openChat();
		const replacement = await openChat();

		outgoing.destroy();
		expect(await messagesSurviveInboxRefresh()).toBe(true);

		replacement.destroy();
		expect(await messagesSurviveInboxRefresh()).toBe(false);
	});
});
