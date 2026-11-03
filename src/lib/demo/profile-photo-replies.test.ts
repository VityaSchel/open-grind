import { describe, expect, it } from "vitest";
import z from "zod";

import { clearAccountCaches } from "$lib/api/account-caches";
import { demoRoute } from "$lib/demo";
import { demoMeProfileId } from "$lib/demo/config";
import { photosOf } from "$lib/demo/mock/profiles";
import { apiResponseMessageSchema } from "$lib/model/messaging/messages";

describe("demo profile photo replies", () => {
	it("includes incoming replies to our profile photo", () => {
		const { messages } = z
			.object({ messages: z.array(apiResponseMessageSchema) })
			.parse(
				demoRoute({
					method: "GET",
					body: undefined,
					path: `/v5/chat/conversation/100006:${demoMeProfileId}/message?profile=true`,
				}).body,
			);
		expect(
			messages.find(
				(message) =>
					message.type === "ProfilePhotoReply" &&
					message.senderId === 100006,
			),
		).toMatchObject({
			senderId: 100006,
			body: {
				imageHash: photosOf(demoMeProfileId)[0],
				photoContentReply: "Great profile photo!",
			},
		});
	});

	it("preserves sent replies until the account caches are cleared", () => {
		const body = {
			imageHash: photosOf(100001)[1],
			photoContentReply: "Nice photo!",
		};
		const sent = apiResponseMessageSchema.parse(
			demoRoute({
				path: "/v4/chat/message/send",
				method: "POST",
				body: {
					type: "ProfilePhotoReply",
					target: { type: "Direct", targetId: 100001 },
					body,
				},
			}).body,
		);
		expect(sent).toMatchObject({
			type: "ProfilePhotoReply",
			senderId: demoMeProfileId,
			body,
		});
		const { messages } = z
			.object({ messages: z.array(apiResponseMessageSchema) })
			.parse(
				demoRoute({
					method: "GET",
					body: undefined,
					path: `/v5/chat/conversation/${sent.conversationId}/message?profile=true`,
				}).body,
			);
		expect(messages[0]).toEqual(sent);
		clearAccountCaches();
		const refreshed = z
			.object({ messages: z.array(apiResponseMessageSchema) })
			.parse(
				demoRoute({
					method: "GET",
					body: undefined,
					path: `/v5/chat/conversation/${sent.conversationId}/message?profile=true`,
				}).body,
			);
		expect(
			refreshed.messages.some(
				(message) => message.messageId === sent.messageId,
			),
		).toBe(false);
	});
});
