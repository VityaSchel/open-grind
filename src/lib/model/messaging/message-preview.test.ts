import { afterEach, describe, expect, it } from "vitest";

import { setLocale, SOURCE_LOCALE } from "$lib/i18n";
import { PSEUDO_MESSAGE } from "$lib/i18n/fixtures/pseudo-message";
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
				dynamic: false,
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
				dynamic: false,
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
				dynamic: false,
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
			dynamic: false,
		});

		expect(preview).toEqual({
			type: "ExpiringImage",
			text: null,
			albumId: null,
			imageHash: null,
		});
		expect(previewLabel(preview)).toBe("Expiring image");
	});

	it("labels a chat video the way its bubble does", () => {
		const preview = previewFromMessage({
			type: "Video",
			body: {
				mediaId: 12,
				url: "https://cdns.grindr.com/videos/chat/clip.mp4",
				contentType: "video/mp4",
				length: 8000,
				maxViews: 2,
				viewsRemaining: 2,
				looping: false,
			},
			messageId: "msg-5",
			conversationId: "conversation-1",
			senderId: 42,
			timestamp: 1_710_000_000_000,
			unsent: false,
			reactions: [],
			dynamic: false,
		});

		expect(previewLabel(preview)).toBe("Expiring video");
		expect(previewLabel({ type: "PrivateVideo" })).toBe("Expiring video");
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
		["NonExpiringVideo", "Video"],
		["Unknown", "Message"],
	])("names a %s quote rather than rendering nothing", (type, expected) => {
		expect(previewLabel(preview(type))).toBeNull();
		expect(quoteLabel(preview(type))).toBe(expected);
	});

	it("defers to the inbox wording for a type the preview already names", () => {
		expect(previewLabel(preview("ExpiringImage"))).toBe("Expiring image");
		expect(quoteLabel(preview("ExpiringImage"))).toBe("Expiring image");
	});

	it("does not render an empty pill for a blank text message", () => {
		expect(quoteLabel(preview("Text", "   "))).toBe("Message");
	});
});

describe("preview labels across locales", () => {
	afterEach(async () => {
		await setLocale({ locale: SOURCE_LOCALE });
	});

	it("translates a type at call time and leaves message text alone", async () => {
		await setLocale({ locale: "en-XA" });

		expect(previewLabel({ type: "Image" })).toMatch(PSEUDO_MESSAGE);
		expect(previewLabel({ type: "Album", albumId: 7 })).toMatch(
			PSEUDO_MESSAGE,
		);
		expect(previewLabel({ type: "Text", text: "Album" })).toBe("Album");
		expect(previewLabel(null)).toBeNull();
		expect(quoteLabel({ type: "Unsent" })).toMatch(PSEUDO_MESSAGE);
		expect(quoteLabel({ type: "Giphy" })).toMatch(PSEUDO_MESSAGE);
		expect(quoteLabel({ type: "Text", text: "   " })).toMatch(
			PSEUDO_MESSAGE,
		);
		expect(quoteLabel({ type: "Text", text: "Photo" })).toBe("Photo");
	});
});
