import { describe, expect, it } from "vitest";

import {
	previewFromMessage,
	previewLabel,
} from "$lib/model/messaging/message-preview";
import { apiResponseMessageSchema } from "$lib/model/messaging/messages";
import { demoAlbumContent } from "./mock/albums";
import { demoSentMessage } from "./mock/conversations";

describe("demo album reactions", () => {
	it("returns a modeled reaction for the selected album item", () => {
		const item = demoAlbumContent(5004).content[1]!;
		const message = apiResponseMessageSchema.parse(
			demoSentMessage({
				type: "AlbumContentReaction",
				target: { targetId: 100006 },
				body: { albumId: 5004, albumContentId: item.contentId },
			}),
		);
		expect(message).toMatchObject({
			type: "AlbumContentReaction",
			body: {
				albumId: 5004,
				albumContentId: item.contentId,
				previewUrl: item.thumbUrl,
				viewable: true,
			},
		});
		expect(previewLabel(previewFromMessage(message))).toBe(
			"Reacted to an album",
		);
	});
	it.each([
		[100006, 5004, 999999, "missing item"],
		[100001, 5005, 500500, "unshared album"],
		[100001, 9999, 999900, "missing album"],
		[100009, 5002, 500200, "locked album"],
		[100006, 5004, 500402, "played-out video"],
	])(
		"hides unavailable reaction media for %s/%s/%s (%s)",
		(targetId, albumId, albumContentId) => {
			const message = demoSentMessage({
				type: "AlbumContentReaction",
				target: { targetId },
				body: { albumId, albumContentId },
			});
			expect(message).toMatchObject({
				type: "AlbumContentReaction",
				body: {
					albumId,
					albumContentId,
					viewable: false,
					previewUrl: null,
				},
			});
		},
	);
});
