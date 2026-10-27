import { describe, expect, it, vi } from "vitest";
import z from "zod";

import { demoRoute } from "$lib/demo";
import { DAY, demoMeProfileId, NOW } from "$lib/demo/config";
import { apiResponseMessageSchema } from "$lib/model/messaging/messages";

const route = (options: Parameters<typeof demoRoute>[0]) =>
	demoRoute(options).body;

describe("demo album replies", () => {
	it("keeps the default conversation's first page and greeting", () => {
		const { messages } = z
			.object({ messages: z.array(apiResponseMessageSchema) })
			.parse(
				route({
					path: `/v5/chat/conversation/100001:${demoMeProfileId}/message?profile=true`,
					method: "GET",
					body: null,
				}),
			);
		expect(messages).toHaveLength(7);
		expect(messages.at(-1)).toMatchObject({
			type: "Text",
			body: { text: "Hey! Lorem ipsum dolor sit amet." },
		});
	});

	it("includes incoming replies to the current user's shared album", () => {
		const { messages } = z
			.object({ messages: z.array(apiResponseMessageSchema) })
			.parse(
				route({
					path: `/v5/chat/conversation/100006:${demoMeProfileId}/message?profile=true`,
					method: "GET",
					body: null,
				}),
			);
		expect(
			messages.find((message) => message.type === "AlbumContentReply"),
		).toMatchObject({
			senderId: 100006,
			body: {
				albumId: 901,
				albumContentId: 90100,
				albumContentReply: "Great video!",
				ownerProfileId: demoMeProfileId,
				contentType: "video/mp4",
				viewable: true,
			},
		});
	});

	it("sending an album reply adds metadata for the selected content", () => {
		const body = {
			albumId: 5001,
			albumContentId: 500102,
			albumContentReply: "Great video!",
		};
		const sent = apiResponseMessageSchema.parse(
			route({
				path: "/v4/chat/message/send",
				method: "POST",
				body: {
					type: "AlbumContentReply",
					target: { type: "Direct", targetId: 100001 },
					body,
				},
			}),
		);
		expect(sent).toMatchObject({
			type: "AlbumContentReply",
			body: {
				...body,
				ownerProfileId: 100001,
				contentType: "video/mp4",
				previewUrl: expect.any(String),
				expiresAt: null,
				viewable: true,
			},
		});
	});

	it.each([
		[100009, 5002, 500200, "locked album"],
		[100006, 5004, 500402, "played-out video"],
		[100001, 5001, 999999, "missing content"],
		[100001, 5005, 500500, "unshared album"],
		[100001, 9999, 999900, "missing album"],
	])(
		"keeps the reply text without exposing a preview for %s/%s/%s (%s)",
		(targetId, albumId, albumContentId) => {
			const sent = apiResponseMessageSchema.parse(
				route({
					path: "/v4/chat/message/send",
					method: "POST",
					body: {
						type: "AlbumContentReply",
						target: { type: "Direct", targetId },
						body: {
							albumId,
							albumContentId,
							albumContentReply: "Nice!",
						},
					},
				}),
			);
			expect(sent).toMatchObject({
				type: "AlbumContentReply",
				body: {
					albumContentReply: "Nice!",
					viewable: false,
					previewUrl: null,
				},
			});
		},
	);

	it("hides expired album content when returning a sent reply", () => {
		const clock = vi.spyOn(Date, "now").mockReturnValue(NOW + 2 * DAY);
		try {
			const sent = apiResponseMessageSchema.parse(
				route({
					path: "/v4/chat/message/send",
					method: "POST",
					body: {
						type: "AlbumContentReply",
						target: { type: "Direct", targetId: 100250 },
						body: {
							albumId: 5003,
							albumContentId: 500300,
							albumContentReply: "Nice!",
						},
					},
				}),
			);
			expect(sent).toMatchObject({
				body: {
					albumContentReply: "Nice!",
					viewable: false,
					previewUrl: null,
				},
			});
		} finally {
			clock.mockRestore();
		}
	});
});
