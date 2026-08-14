import { describe, expect, it } from "vitest";

import {
	apiResponseMessageSchema,
	messageSchema,
} from "$lib/model/messaging/messages";

describe("messageSchema", () => {
	it("accepts outgoing text messages", () => {
		expect(
			messageSchema.parse({ type: "Text", body: { text: "hello" } }),
		).toEqual({ type: "Text", body: { text: "hello" } });
	});

	it("rejects private image messages with invalid media hashes", () => {
		const result = messageSchema.safeParse({
			type: "Image",
			body: {
				mediaId: 10,
				url: "https://images.example/private.jpg",
				width: 640,
				height: 480,
				imageHash: "abc123",
				takenOnGrindr: false,
				createdAt: 1_710_000_000_000,
			},
		});

		expect(result.success).toBe(false);
	});

	it("parses expiring image messages as the server sends them", () => {
		const body = {
			mediaId: 2_351_384_549,
			url: "https://cdns.grindr.com/images/chat/expiring.jpg",
			width: 96,
			height: 96,
			duration: 10_000,
			viewsRemaining: 1,
			expiresAt: 1_784_725_105_329,
			viewed: false,
		};

		expect(messageSchema.parse({ type: "ExpiringImage", body })).toEqual({
			type: "ExpiringImage",
			body,
		});
	});

	it("accepts spent expiring image messages with a null url", () => {
		const body = {
			mediaId: 5002,
			width: null,
			height: null,
			url: null,
			duration: 10_000,
			viewsRemaining: 0,
			expiresAt: null,
			viewed: true,
		};

		expect(messageSchema.parse({ type: "ExpiringImage", body })).toEqual({
			type: "ExpiringImage",
			body,
		});
	});

	it("accepts expiring image messages without the view tracking fields", () => {
		const body = {
			mediaId: 5003,
			width: null,
			height: null,
			url: "https://cdns.grindr.com/images/chat/expiring.jpg",
		};

		expect(messageSchema.parse({ type: "ExpiringImage", body })).toEqual({
			type: "ExpiringImage",
			body,
		});
	});

	it("drops regular image fields the server never sends for expiring images", () => {
		expect(
			messageSchema.parse({
				type: "ExpiringImage",
				body: {
					mediaId: 5004,
					width: null,
					height: null,
					url: null,
					imageHash: "a".repeat(64),
					takenOnGrindr: true,
					createdAt: 1_710_000_000_000,
				},
			}),
		).toEqual({
			type: "ExpiringImage",
			body: { mediaId: 5004, width: null, height: null, url: null },
		});
	});
});

describe("apiResponseMessageSchema", () => {
	it("accepts incoming chat messages with response metadata", () => {
		expect(
			apiResponseMessageSchema.parse({
				type: "Text",
				body: { text: "hello" },
				messageId: "msg-1",
				conversationId: "conversation-1",
				senderId: 42,
				timestamp: 1_710_000_000_000,
				unsent: false,
				reactions: [{ profileId: 99, reactionType: 1 }],
			}),
		).toEqual({
			type: "Text",
			body: { text: "hello" },
			messageId: "msg-1",
			conversationId: "conversation-1",
			senderId: 42,
			timestamp: 1_710_000_000_000,
			unsent: false,
			reactions: [{ profileId: 99, reactionType: 1 }],
		});
	});
});
