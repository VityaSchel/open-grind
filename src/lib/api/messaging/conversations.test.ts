import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchRestMock } = vi.hoisted(() => ({ fetchRestMock: vi.fn() }));

vi.mock("$lib/api/transport", async (importOriginal) => ({
	...(await importOriginal<typeof import("$lib/api/transport")>()),
	fetchRest: fetchRestMock,
}));

import {
	deleteConversationForMe,
	getConversations,
	markConversationAsRead,
	setConversationMuted,
	setConversationPinned,
} from "$lib/api/messaging/conversations";

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

function response(data?: unknown, status = 200) {
	return {
		status,
		assertOk() {
			if (status < 200 || status >= 300) {
				throw new Error(`mock assertOk rejected status ${status}`);
			}
		},
		jsonParsed: vi.fn((schema: { parse(value: unknown): unknown }) =>
			schema.parse(data),
		),
	};
}

beforeEach(() => {
	fetchRestMock.mockReset();
});

describe("conversation API wrappers", () => {
	it("loads paged conversations through the inbox endpoint without a body", async () => {
		const data = { entries: [conversation()], nextPage: 2 };
		fetchRestMock.mockResolvedValue(response(data));

		await expect(getConversations({ page: 3 })).resolves.toEqual(data);

		expect(fetchRestMock).toHaveBeenCalledWith("/v4/inbox?page=3", {
			method: "POST",
		});
	});

	it("sends the full filter body when filters are given", async () => {
		const data = { entries: [], nextPage: null };
		fetchRestMock.mockResolvedValue(response(data));
		const filters = {
			unreadOnly: false,
			chemistryOnly: false,
			favoritesOnly: true,
			rightNowOnly: false,
			onlineNowOnly: false,
			distanceMeters: null,
			positions: [],
		};

		await expect(getConversations({ filters })).resolves.toEqual(data);

		expect(fetchRestMock).toHaveBeenCalledWith("/v4/inbox?page=1", {
			method: "POST",
			body: filters,
		});
	});

	it("marks conversations as read using the default message id", async () => {
		fetchRestMock.mockResolvedValue(response());

		await expect(
			markConversationAsRead({ conversationId: "conversation-1" }),
		).resolves.toBeUndefined();

		expect(fetchRestMock).toHaveBeenCalledWith(
			"/v4/chat/conversation/conversation-1/read/0:00000000-0000-0000-0000-000000000000",
			{ method: "POST" },
		);
	});

	it("rejects marking as read on non-2xx responses", async () => {
		fetchRestMock.mockResolvedValue(response(undefined, 500));

		await expect(
			markConversationAsRead({ conversationId: "conversation-1" }),
		).rejects.toThrow("mock assertOk rejected status 500");
	});

	it("deletes conversations for the current user", async () => {
		fetchRestMock.mockResolvedValue(response());

		await expect(
			deleteConversationForMe({ conversationId: "conversation-1" }),
		).resolves.toBeUndefined();

		expect(fetchRestMock).toHaveBeenCalledWith(
			"/v4/chat/conversation/conversation-1",
			{ method: "DELETE" },
		);
	});

	it("rejects deletion on non-2xx responses", async () => {
		fetchRestMock.mockResolvedValue(response(undefined, 500));

		await expect(
			deleteConversationForMe({ conversationId: "conversation-1" }),
		).rejects.toThrow("mock assertOk rejected status 500");
	});

	it.each([
		{ pinned: true, action: "pin" },
		{ pinned: false, action: "unpin" },
	])("$action requests for conversations", async ({ pinned, action }) => {
		fetchRestMock.mockResolvedValue(response());

		await expect(
			setConversationPinned({ conversationId: "conversation-1", pinned }),
		).resolves.toBeUndefined();

		expect(fetchRestMock).toHaveBeenCalledWith(
			`/v4/chat/conversation/conversation-1/${action}`,
			{ method: "POST" },
		);
	});

	it("rejects pinning on non-2xx responses", async () => {
		fetchRestMock.mockResolvedValue(response(undefined, 403));

		await expect(
			setConversationPinned({
				conversationId: "conversation-1",
				pinned: true,
			}),
		).rejects.toThrow("mock assertOk rejected status 403");
	});

	it.each([
		{ muted: true, action: "mute" },
		{ muted: false, action: "unmute" },
	])("$action requests for conversations", async ({ muted, action }) => {
		fetchRestMock.mockResolvedValue(response());

		await expect(
			setConversationMuted({ conversationId: "conversation-1", muted }),
		).resolves.toBeUndefined();

		expect(fetchRestMock).toHaveBeenCalledWith(
			`/v1/push/conversation/conversation-1/${action}`,
			{ method: "POST" },
		);
	});

	it("rejects muting on non-2xx responses", async () => {
		fetchRestMock.mockResolvedValue(response(undefined, 500));

		await expect(
			setConversationMuted({
				conversationId: "conversation-1",
				muted: true,
			}),
		).rejects.toThrow("mock assertOk rejected status 500");
	});
});
