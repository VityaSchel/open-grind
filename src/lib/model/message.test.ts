import { describe, expect, it } from "vitest";

import {
	apiResponseMessageSchema,
	messageSchema,
	previewFromMessage,
} from "$lib/model/message";

describe("messageSchema", () => {
	it("accepts outgoing text messages", () => {
		expect(
			messageSchema.parse({
				type: "Text",
				body: {
					text: "hello",
				},
			}),
		).toEqual({
			type: "Text",
			body: {
				text: "hello",
			},
		});
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
});

describe("apiResponseMessageSchema", () => {
	it("accepts incoming chat messages with response metadata", () => {
		expect(
			apiResponseMessageSchema.parse({
				type: "Text",
				body: {
					text: "hello",
				},
				messageId: "msg-1",
				conversationId: "conversation-1",
				senderId: 42,
				timestamp: 1_710_000_000_000,
				unsent: false,
				reactions: [
					{
						profileId: 99,
						reactionType: 1,
					},
				],
			}),
		).toEqual({
			type: "Text",
			body: {
				text: "hello",
			},
			messageId: "msg-1",
			conversationId: "conversation-1",
			senderId: 42,
			timestamp: 1_710_000_000_000,
			unsent: false,
			reactions: [
				{
					profileId: 99,
					reactionType: 1,
				},
			],
		});
	});
});

describe("previewFromMessage", () => {
	it("extracts preview text from text messages", () => {
		expect(
			previewFromMessage({
				type: "Text",
				body: { text: "hello" },
				messageId: "msg-1",
				conversationId: "conversation-1",
				senderId: 42,
				timestamp: 1_710_000_000_000,
				unsent: false,
				reactions: [],
			}),
		).toEqual({
			type: "Text",
			text: "hello",
			albumId: null,
			imageHash: null,
		});
	});

	it("extracts album previews without inventing text", () => {
		expect(
			previewFromMessage({
				type: "Album",
				body: {
					albumId: 7,
					hasUnseenContent: false,
					expiresAt: null,
					coverUrl: "https://example.com/cover.jpg",
					ownerProfileId: 42,
					isViewable: true,
					hasVideo: false,
					hasPhoto: true,
					expirationType: null,
				},
				messageId: "msg-2",
				conversationId: "conversation-1",
				senderId: 42,
				timestamp: 1_710_000_000_000,
				unsent: false,
				reactions: [],
			}),
		).toEqual({
			type: "Album",
			text: null,
			albumId: 7,
			imageHash: null,
		});
	});
});
