import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchRestMock } = vi.hoisted(() => ({ fetchRestMock: vi.fn() }));

vi.mock("$lib/api", async (importOriginal) => ({
	...(await importOriginal<typeof import("$lib/api")>()),
	fetchRest: fetchRestMock,
}));

import {
	deleteConversationForMe,
	getConversations,
	markConversationAsRead,
} from "$lib/api/conversation";

const participant = {
	profileId: 42,
	primaryMediaHash: null,
	lastOnline: null,
	onlineUntil: null,
	distanceMetres: null,
	position: null,
	isInAList: false,
	hasDatingPotential: false,
};

function conversation(conversationId = "conversation-1") {
	return {
		type: "full_conversation_v1",
		data: {
			conversationId,
			name: "Alex",
			participants: [participant],
			lastActivityTimestamp: 1_710_000_000_000,
			unreadCount: 0,
			preview: null,
			muted: false,
			pinned: false,
			favorite: false,
			rightNow: "NOT_ACTIVE",
			onlineUntil: null,
			hasUnreadThrob: false,
		},
	};
}

function response(data?: unknown) {
	return {
		jsonParsed: vi.fn((schema: { parse(value: unknown): unknown }) =>
			schema.parse(data),
		),
	};
}

beforeEach(() => {
	fetchRestMock.mockReset();
});

describe("conversation API wrappers", () => {
	it("loads paged conversations through the inbox endpoint", async () => {
		const data = { entries: [conversation()], nextPage: 2 };
		fetchRestMock.mockResolvedValue(response(data));

		await expect(getConversations(3)).resolves.toEqual(data);

		expect(fetchRestMock).toHaveBeenCalledWith("/v4/inbox?page=3", {
			method: "POST",
		});
	});

	it("marks conversations as read using the default message id", async () => {
		const res = response();
		fetchRestMock.mockResolvedValue(res);

		await expect(
			markConversationAsRead({ conversationId: "conversation-1" }),
		).resolves.toBe(res);

		expect(fetchRestMock).toHaveBeenCalledWith(
			"/v4/chat/conversation/conversation-1/read/0:00000000-0000-0000-0000-000000000000",
			{ method: "POST" },
		);
	});

	it("deletes conversations for the current user", async () => {
		const res = response();
		fetchRestMock.mockResolvedValue(res);

		await expect(
			deleteConversationForMe({ conversationId: "conversation-1" }),
		).resolves.toBe(res);

		expect(fetchRestMock).toHaveBeenCalledWith(
			"/v4/chat/conversation/conversation-1",
			{ method: "DELETE" },
		);
	});
});
