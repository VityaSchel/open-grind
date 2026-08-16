import { beforeEach, describe, expect, it, vi } from "vitest";

const { getConversationMock, sendMessageMock } = vi.hoisted(() => ({
	getConversationMock: vi.fn(),
	sendMessageMock: vi.fn(),
}));

vi.mock("$lib/api/error-toast", () => ({ showErrorToast: vi.fn() }));
vi.mock("$lib/app-data/preferences.svelte", () => ({
	getPreferences: () => Promise.resolve({ revealMessageRead: true }),
}));
vi.mock("$lib/api/messaging/conversations", () => ({
	markConversationAsRead: vi.fn(() => Promise.resolve()),
}));
vi.mock("$lib/api/messaging/messages", async (importOriginal) => ({
	...(await importOriginal<typeof import("$lib/api/messaging/messages")>()),
	reactToMessage: vi.fn(),
	sendMessage: sendMessageMock,
}));
vi.mock("$lib/util/reconcile", () => ({
	reconciler: { subscribe: () => vi.fn() },
}));
vi.mock("./messages", () => ({ getConversation: getConversationMock }));
vi.mock("$lib/ws.svelte", async (importOriginal) => ({
	...(await importOriginal<typeof import("$lib/ws.svelte")>()),
	ws: { on: () => Promise.resolve(vi.fn()) },
}));

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

const profile = {
	distance: null,
	mediaHash: null,
	name: "Peer",
	onlineUntil: null,
	profileId: PEER_ID,
	showDistance: false,
};

const flush = () => new Promise((r) => setTimeout(r, 0));

function outbound(type: string, body: unknown): MessageDraft {
	const message = { type, body } as unknown as Message;
	return {
		outbound: message as unknown as OutboundMessage,
		optimistic: message,
	};
}

async function stateWithMessage() {
	getConversationMock.mockResolvedValue({
		messages: [
			{
				messageId: "target",
				conversationId: CONVERSATION_ID,
				senderId: OUR_ID,
				timestamp: 5000,
				unsent: false,
				reactions: [],
				type: "Text",
				body: { text: "quote me" },
			},
		],
		profile,
		pageKey: null,
		lastReadTimestamp: null,
	});
	const state = new ConversationState({
		conversationId: CONVERSATION_ID,
		ourProfileId: OUR_ID,
		conversations: {
			setActive: vi.fn(),
			clearActive: vi.fn(),
			getCachedConversation: vi.fn(() => undefined),
			setCachedConversation: vi.fn(),
			updatePreview: vi.fn(),
			markRead: vi.fn(),
			ensureLoaded: vi.fn(),
			remove: vi.fn(() => ({ revert: vi.fn() })),
			drafts: new Drafts(),
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		} as any,
	});
	await flush();
	return state;
}

describe("ConversationState reply target", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		sendMessageMock.mockReturnValue(new Promise(() => {}));
	});

	it("resolves the armed target from the loaded messages", async () => {
		const state = await stateWithMessage();

		state.setReplyTo(state.messages[0]!);

		expect(state.replyTo?.messageId).toBe("target");
	});

	it("forgets the target once the message it quotes is unsent", async () => {
		const state = await stateWithMessage();
		state.setReplyTo(state.messages[0]!);

		state.markMessageAsUnsent("target");

		expect(state.replyTo).toBeNull();
	});

	it("forgets the target once the message it quotes is deleted", async () => {
		const state = await stateWithMessage();
		state.setReplyTo(state.messages[0]!);

		state.remove("target");

		expect(state.replyTo).toBeNull();
	});

	it("sends the reply id and clears the target once", async () => {
		const state = await stateWithMessage();
		state.setReplyTo(state.messages[0]!);

		state.send([outbound("Text", { text: "a" })]);

		expect(sendMessageMock).toHaveBeenCalledWith(
			expect.objectContaining({ replyToMessageId: "target" }),
		);
		expect(state.replyTo).toBeNull();
	});

	it("quotes the same target from every message of one batch", async () => {
		const state = await stateWithMessage();
		state.setReplyTo(state.messages[0]!);

		state.send([
			outbound("Image", { mediaId: 1 }),
			outbound("Image", { mediaId: 2 }),
		]);

		expect(sendMessageMock).toHaveBeenCalledTimes(2);
		for (const call of sendMessageMock.mock.calls) {
			expect(call[0]).toMatchObject({ replyToMessageId: "target" });
		}
		expect(state.replyTo).toBeNull();
	});

	it("sends nothing about a reply when none is armed", async () => {
		const state = await stateWithMessage();

		state.send([outbound("Text", { text: "a" })]);

		expect(sendMessageMock).toHaveBeenCalledWith(
			expect.objectContaining({ replyToMessageId: undefined }),
		);
	});
});
