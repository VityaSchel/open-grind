import { describe, expect, it } from "vitest";

import {
	previewFromMessage,
	previewLabel,
	quoteLabel,
} from "$lib/model/messaging/message-preview";

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
		).toEqual({ type: "Album", text: null, albumId: 7, imageHash: null });
	});

	it.each(["ExpiringAlbum", "ExpiringAlbumV2"] as const)(
		"keeps the albumId for %s so the preview reads as an album",
		(type) => {
			const preview = previewFromMessage({
				type,
				body: {
					albumId: 9,
					hasUnseenContent: false,
					expiresAt: 1_710_000_000_000,
					coverUrl: "https://example.com/cover.jpg",
					ownerProfileId: 42,
					isViewable: true,
					hasVideo: false,
					hasPhoto: true,
					expirationType: "ONCE",
					viewableUntil: 1_710_000_000_000,
				},
				messageId: "msg-3",
				conversationId: "conversation-1",
				senderId: 42,
				timestamp: 1_710_000_000_000,
				unsent: false,
				reactions: [],
			});
			expect(preview).toEqual({
				type,
				text: null,
				albumId: 9,
				imageHash: null,
			});
			expect(previewLabel(preview)).toBe("Album");
		},
	);

	it("labels expiring images apart from regular photos", () => {
		const preview = previewFromMessage({
			type: "ExpiringImage",
			body: {
				mediaId: 11,
				width: null,
				height: null,
				url: null,
				viewsRemaining: 1,
			},
			messageId: "msg-4",
			conversationId: "conversation-1",
			senderId: 42,
			timestamp: 1_710_000_000_000,
			unsent: false,
			reactions: [],
		});

		expect(preview).toEqual({
			type: "ExpiringImage",
			text: null,
			albumId: null,
			imageHash: null,
		});
		expect(previewLabel(preview)).toBe("Expiring photo");
	});
});

describe("quoteLabel", () => {
	const preview = (type: string, text: string | null = null) => ({
		type,
		text,
		albumId: null,
		imageHash: null,
	});

	it("uses the message text when there is any", () => {
		expect(quoteLabel(preview("Text", "hello"))).toBe("hello");
	});

	it.each([
		["Unsent", "Unsent message"],
		["Audio", "Voice message"],
		["Giphy", "GIF"],
		["Location", "Location"],
		["Unknown", "Message"],
	])("names a %s quote rather than rendering nothing", (type, expected) => {
		expect(previewLabel(preview(type))).toBeNull();
		expect(quoteLabel(preview(type))).toBe(expected);
	});

	it("defers to the inbox wording for a type the preview already names", () => {
		expect(previewLabel(preview("ExpiringImage"))).toBe("Expiring photo");
		expect(quoteLabel(preview("ExpiringImage"))).toBe("Expiring photo");
	});

	it("does not render an empty pill for a blank text message", () => {
		expect(quoteLabel(preview("Text", "   "))).toBe("Message");
	});
});
