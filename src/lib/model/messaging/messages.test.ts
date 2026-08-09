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

	it("parses expiring image messages with full image fields", () => {
		const body = {
			mediaId: 5001,
			width: 640,
			height: 480,
			url: "https://cdns.grindr.com/images/chat/expiring.jpg",
			imageHash: "a".repeat(64),
			takenOnGrindr: true,
			createdAt: 1_710_000_000_000,
			viewsRemaining: 1,
		};

		expect(
			messageSchema.parse({
				type: "ExpiringImage",
				body,
			}),
		).toEqual({
			type: "ExpiringImage",
			body,
		});
	});

	it("accepts expiring image messages with null url and viewsRemaining", () => {
		const body = {
			mediaId: 5002,
			width: null,
			height: null,
			url: null,
			imageHash: "b".repeat(64),
			takenOnGrindr: false,
			createdAt: null,
			viewsRemaining: null,
		};

		expect(
			messageSchema.parse({
				type: "ExpiringImage",
				body,
			}),
		).toEqual({
			type: "ExpiringImage",
			body,
		});
	});

	it("parses real-world expiring image messages without imageHash/takenOnGrindr/createdAt", () => {
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

		expect(
			messageSchema.parse({
				type: "ExpiringImage",
				body,
			}),
		).toEqual({
			type: "ExpiringImage",
			body,
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
