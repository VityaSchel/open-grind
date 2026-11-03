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

async function stateWithMessage({
	drafts = new Drafts(),
}: { drafts?: Drafts } = {}) {
	const snapshot = {
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
	};
	getConversationMock.mockResolvedValue(snapshot);
	const state = new ConversationState({
		conversationId: CONVERSATION_ID,
		ourProfileId: OUR_ID,
		conversations: {
			setActive: vi.fn(() => vi.fn()),
			getCachedConversation: vi.fn(() => undefined),
			setCachedConversation: vi.fn(),
			updatePreview: vi.fn(),
			markRead: vi.fn(),
			ensureLoaded: vi.fn(),
			remove: vi.fn(() => ({ revert: vi.fn() })),
			drafts,
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		} as any,
	});
	await flush();
	return state;
}

function replyToFirstMessage(state: ConversationState) {
	const message = state.messages.at(0);
	if (!message) throw new Error("The conversation has no message to quote");
	state.setReplyTo(message);
}

describe("ConversationState reply target", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		sendMessageMock.mockReturnValue(new Promise(() => {}));
	});

	it("resolves the armed target from the loaded messages", async () => {
		const state = await stateWithMessage();

		replyToFirstMessage(state);

		expect(state.replyTo?.messageId).toBe("target");
	});

	it("forgets the target once the message it quotes is unsent", async () => {
		const state = await stateWithMessage();
		replyToFirstMessage(state);

		state.markMessageAsUnsent("target");

		expect(state.replyTo).toBeNull();
	});

	it("forgets the target once the message it quotes is deleted", async () => {
		const state = await stateWithMessage();
		replyToFirstMessage(state);

		state.remove("target");

		expect(state.replyTo).toBeNull();
	});

	it("sends the reply id and clears the target once", async () => {
		const state = await stateWithMessage();
		replyToFirstMessage(state);

		state.send([outbound("Text", { text: "a" })]);

		expect(sendMessageMock).toHaveBeenCalledWith(
			expect.objectContaining({ replyToMessageId: "target" }),
		);
		expect(state.replyTo).toBeNull();
	});

	it("quotes the same target from every message of one batch", async () => {
		const state = await stateWithMessage();
		replyToFirstMessage(state);

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

it("an inline album reply preserves the composer draft and selected quote", async () => {
	const drafts = new Drafts();
	const state = await stateWithMessage({ drafts });
	drafts.save({
		conversationId: CONVERSATION_ID,
		text: "Unfinished chat message",
	});
	replyToFirstMessage(state);
	sendMessageMock.mockClear();
	state.send(
		[
			outbound("AlbumContentReply", {
				albumId: 7,
				albumContentId: 71,
				albumContentReply: "Nice photo",
			}),
		],
		{ includeReply: false },
	);
	expect(sendMessageMock).toHaveBeenCalledWith(
		expect.objectContaining({
			replyToMessageId: undefined,
			message: {
				type: "AlbumContentReply",
				body: {
					albumId: 7,
					albumContentId: 71,
					albumContentReply: "Nice photo",
				},
			},
		}),
	);
	expect(state.replyTo?.messageId).toBe("target");
	expect(drafts.get(CONVERSATION_ID)).toBe("Unfinished chat message");
	state.destroy();
	expect(drafts.get(CONVERSATION_ID)).toBe("Unfinished chat message");
	expect(drafts.replyTo(CONVERSATION_ID)).toBe("target");
	drafts.destroy();
	expect(drafts.get(CONVERSATION_ID)).toBe("");
	expect(drafts.replyTo(CONVERSATION_ID)).toBeNull();
});

it("sends album reactions without consuming an armed chat reply", async () => {
	const state = await stateWithMessage();
	try {
		replyToFirstMessage(state);
		state.send(
			[
				outbound("AlbumContentReaction", {
					albumId: 7,
					albumContentId: 71,
				}),
			],
			{ includeReply: false },
		);
		expect(state.replyTo?.messageId).toBe("target");
		expect(state.messages[0]?.replyToMessage).toBeNull();
		expect(sendMessageMock).toHaveBeenLastCalledWith({
			toUserId: PEER_ID,
			message: {
				type: "AlbumContentReaction",
				body: { albumId: 7, albumContentId: 71 },
			},
			replyToMessageId: undefined,
		});
	} finally {
		state.destroy();
	}
});

it("keeps the armed reply when an album reaction fails", async () => {
	const error = new Error("Offline");
	const logged = vi.spyOn(console, "error").mockImplementation(() => {});
	sendMessageMock.mockRejectedValueOnce(error);
	const state = await stateWithMessage();
	try {
		replyToFirstMessage(state);
		state.send(
			[
				outbound("AlbumContentReaction", {
					albumId: 7,
					albumContentId: 71,
				}),
			],
			{ includeReply: false },
		);
		await vi.waitFor(() => expect(state.messages[0]?.status).toBe("error"));
		expect(state.messages[0]?.sendError).toBe(error);
		expect(state.replyTo?.messageId).toBe("target");
	} finally {
		state.destroy();
		logged.mockRestore();
	}
});

it("sends a profile photo reply without consuming the chat reply target", async () => {
	const state = await stateWithMessage();
	replyToFirstMessage(state);
	const body = {
		imageHash: "selected-photo",
		photoContentReply: "Nice photo!",
	};

	state.send([outbound("ProfilePhotoReply", body)], { includeReply: false });

	expect(sendMessageMock).toHaveBeenCalledWith(
		expect.objectContaining({
			message: { type: "ProfilePhotoReply", body },
			replyToMessageId: undefined,
		}),
	);
	expect(state.replyTo?.messageId).toBe("target");
});
