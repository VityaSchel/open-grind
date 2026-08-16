import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { fetchRestMock, sendCommandMock } = vi.hoisted(() => ({
	fetchRestMock: vi.fn(),
	sendCommandMock: vi.fn(),
}));

vi.mock("$lib/api/transport", async (importOriginal) => ({
	...(await importOriginal<typeof import("$lib/api/transport")>()),
	fetchRest: fetchRestMock,
}));

vi.mock("$lib/ws.svelte", () => ({ ws: { sendCommand: sendCommandMock } }));

import {
	ConversationUnavailableError,
	deleteMessageForMe,
	getConversationMessages,
	getSingleMessage,
	reactToMessage,
	sendMessage,
	unsendMessage,
} from "$lib/api/messaging/messages";

function apiMessage(overrides = {}) {
	return {
		type: "Text",
		body: { text: "hello" },
		messageId: "msg-1",
		conversationId: "conversation-1",
		senderId: 42,
		timestamp: 1_710_000_000_000,
		unsent: false,
		reactions: [],
		...overrides,
	};
}

function response({
	data,
	status = 200,
	assertOkErrorMessage,
	body,
}: {
	data?: unknown;
	status?: number;
	assertOkErrorMessage?: string;
	body?: string;
} = {}) {
	return {
		status,
		assertOk() {
			if (status >= 200 && status < 300) return;
			throw new Error(
				assertOkErrorMessage ??
					`API request failed with status ${status}`,
			);
		},
		text: () => body ?? JSON.stringify(data ?? null),
		json: () => data,
		jsonParsed: vi.fn((schema: { parse(value: unknown): unknown }) =>
			schema.parse(data),
		),
	};
}

beforeEach(() => {
	fetchRestMock.mockReset();
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe("message API wrappers", () => {
	it("loads conversation messages with profile and page key parameters", async () => {
		const data = {
			lastReadTimestamp: null,
			messages: [apiMessage()],
			profile: {
				distance: null,
				mediaHash: null,
				name: "Alex",
				onlineUntil: null,
				profileId: 42,
				showDistance: true,
			},
		};
		fetchRestMock.mockResolvedValue(response({ data }));

		await expect(
			getConversationMessages({
				conversationId: "conversation-1",
				pageKey: "next-page",
			}),
		).resolves.toEqual(data);

		expect(fetchRestMock).toHaveBeenCalledWith(
			"/v5/chat/conversation/conversation-1/message?profile=true&pageKey=next-page",
			{ method: "GET" },
		);
	});

	it("reports a conversation the server refuses as unavailable", async () => {
		fetchRestMock.mockResolvedValue(
			response({
				status: 403,
				body: JSON.stringify({
					type: "urn:gr:err:unauthorized_action",
					title: "Action not permitted",
					status: 403,
				}),
			}),
		);

		await expect(
			getConversationMessages({ conversationId: "conversation-1" }),
		).rejects.toBeInstanceOf(ConversationUnavailableError);
	});

	it("keeps a Cloudflare 403 a transport failure, not a missing conversation", async () => {
		const res = response({
			status: 403,
			body: "<html><title>Attention Required! | Cloudflare</title></html>",
			assertOkErrorMessage: "API request failed with status 403",
		});
		fetchRestMock.mockResolvedValue(res);

		const error = await getConversationMessages({
			conversationId: "conversation-1",
		}).catch((e: unknown) => e);

		expect(error).not.toBeInstanceOf(ConversationUnavailableError);
		expect(error).toBeInstanceOf(Error);
		expect(res.jsonParsed).not.toHaveBeenCalled();
	});

	it("keeps an unrelated 403 JSON body a transport failure", async () => {
		fetchRestMock.mockResolvedValue(
			response({
				status: 403,
				body: JSON.stringify({
					type: "urn:gr:err:header",
					status: 403,
				}),
			}),
		);

		const error = await getConversationMessages({
			conversationId: "conversation-1",
		}).catch((e: unknown) => e);

		expect(error).not.toBeInstanceOf(ConversationUnavailableError);
		expect(error).toBeInstanceOf(Error);
	});

	it("loads a single message by conversation and message id", async () => {
		const data = { message: apiMessage({ messageId: "msg-2" }) };
		fetchRestMock.mockResolvedValue(response({ data }));

		await expect(
			getSingleMessage({
				conversationId: "conversation-1",
				messageId: "msg-2",
			}),
		).resolves.toEqual(data);

		expect(fetchRestMock).toHaveBeenCalledWith(
			"/v4/chat/conversation/conversation-1/message/msg-2",
			{ method: "GET" },
		);
	});

	it("sends direct messages through the expected request shape", async () => {
		const message = apiMessage();
		fetchRestMock.mockResolvedValue(response({ data: message }));

		await expect(
			sendMessage({
				toUserId: 99,
				message: { type: "Text", body: { text: "hello" } },
			}),
		).resolves.toEqual(message);

		expect(fetchRestMock).toHaveBeenCalledWith("/v4/chat/message/send", {
			method: "POST",
			body: {
				type: "Text",
				target: { type: "Direct", targetId: 99 },
				body: { text: "hello" },
			},
		});
		expect(sendCommandMock).not.toHaveBeenCalled();
	});

	it("sends a reply over the websocket, which is the only transport that takes one", async () => {
		const message = apiMessage({ messageId: "msg-reply" });
		sendCommandMock.mockResolvedValue(message);

		await expect(
			sendMessage({
				toUserId: 99,
				message: { type: "Text", body: { text: "hello" } },
				replyToMessageId: "msg-quoted",
			}),
		).resolves.toEqual(message);

		expect(fetchRestMock).not.toHaveBeenCalled();
		expect(sendCommandMock).toHaveBeenCalledWith(
			expect.objectContaining({
				type: "chat.v1.message.send",
				payload: {
					type: "Text",
					target: { type: "Direct", targetId: 99 },
					body: { text: "hello" },
					replyToMessageId: "msg-quoted",
				},
			}),
		);
	});

	it("sends image messages by media reference only", async () => {
		const imageBody = {
			mediaId: 910_001,
			width: null,
			height: null,
			url: "https://cdns.grindr.com/images/chat/a".padEnd(100, "b"),
			imageHash: "a".repeat(64),
			takenOnGrindr: false,
			createdAt: 1_710_000_000_000,
		};
		const responseMessage = apiMessage({ type: "Image", body: imageBody });
		fetchRestMock.mockResolvedValue(response({ data: responseMessage }));

		await expect(
			sendMessage({
				toUserId: 99,
				message: { type: "Image", body: { mediaId: 910_001 } },
			}),
		).resolves.toEqual(responseMessage);

		expect(fetchRestMock).toHaveBeenCalledWith("/v4/chat/message/send", {
			method: "POST",
			body: {
				type: "Image",
				target: { type: "Direct", targetId: 99 },
				body: { mediaId: 910_001 },
			},
		});
	});

	it("sends expiring images as a media reference plus the expiring flag", async () => {
		const responseMessage = apiMessage({
			type: "ExpiringImage",
			body: {
				mediaId: 910_002,
				width: null,
				height: null,
				url: null,
				viewsRemaining: 1,
				duration: 10_000,
			},
		});
		fetchRestMock.mockResolvedValue(response({ data: responseMessage }));

		await expect(
			sendMessage({
				toUserId: 99,
				message: {
					type: "ExpiringImage",
					body: { mediaId: 910_002, expiring: true },
				},
			}),
		).resolves.toEqual(responseMessage);

		expect(fetchRestMock).toHaveBeenCalledWith("/v4/chat/message/send", {
			method: "POST",
			body: {
				type: "ExpiringImage",
				target: { type: "Direct", targetId: 99 },
				body: { mediaId: 910_002, expiring: true },
			},
		});
	});

	it("posts reactions without parsing a response body", async () => {
		const res = response();
		fetchRestMock.mockResolvedValue(res);

		await expect(
			reactToMessage({
				conversationId: "conversation-1",
				messageId: "msg-1",
				reactionType: 1,
			}),
		).resolves.toBe(res);

		expect(fetchRestMock).toHaveBeenCalledWith(
			"/v4/chat/message/reaction",
			{
				method: "POST",
				body: {
					conversationId: "conversation-1",
					messageId: "msg-1",
					reactionType: 1,
				},
			},
		);
	});

	it("throws when delete requests return non-200 statuses", async () => {
		vi.spyOn(console, "log").mockImplementation(() => {});
		fetchRestMock.mockResolvedValue(
			response({
				data: { error: true },
				status: 500,
				assertOkErrorMessage: "Failed to delete message",
			}),
		);

		await expect(
			deleteMessageForMe({
				conversationId: "conversation-1",
				messageId: "msg-1",
			}),
		).rejects.toThrow("Failed to delete message");

		expect(fetchRestMock).toHaveBeenCalledWith("/v4/chat/message/delete", {
			method: "POST",
			body: { conversationId: "conversation-1", messageId: "msg-1" },
		});
	});

	it("throws when unsend requests return non-200 statuses", async () => {
		vi.spyOn(console, "log").mockImplementation(() => {});
		fetchRestMock.mockResolvedValue(
			response({
				data: { error: true },
				status: 500,
				assertOkErrorMessage: "Failed to unsend message",
			}),
		);

		await expect(
			unsendMessage({
				conversationId: "conversation-1",
				messageId: "msg-1",
			}),
		).rejects.toThrow("Failed to unsend message");

		expect(fetchRestMock).toHaveBeenCalledWith("/v4/chat/message/unsend", {
			method: "POST",
			body: { conversationId: "conversation-1", messageId: "msg-1" },
		});
	});
});
