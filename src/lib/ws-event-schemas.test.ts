import { describe, expect, it } from "vitest";

import {
	chatV1ConversationDeleteEventSchema,
	chatV1ConversationReadEventSchema,
	chatV1MessageSentEventSchema,
	commandResponseEventSchema,
} from "./ws.svelte";

const deleteEvent = {
	type: "chat.v1.conversation.delete",
	payload: { conversationIds: ["1:2"] },
};

describe("websocket event envelopes", () => {
	it("accepts an event that omits notificationId and ref", () => {
		const parsed =
			chatV1ConversationDeleteEventSchema.safeParse(deleteEvent);

		expect(parsed.success).toBe(true);
		expect(parsed.data?.payload.conversationIds).toEqual(["1:2"]);
	});

	it("still accepts them when the server does send them", () => {
		const parsed = chatV1ConversationDeleteEventSchema.safeParse({
			...deleteEvent,
			notificationId: "n-1",
			ref: null,
		});

		expect(parsed.success).toBe(true);
	});

	it("keeps every chat envelope tolerant of the same omission", () => {
		expect(
			chatV1ConversationReadEventSchema.safeParse({
				type: "chat.v1.conversation_read",
				payload: { conversationId: "1:2", profileId: 7, timestamp: 1 },
			}).success,
		).toBe(true);

		expect(
			chatV1MessageSentEventSchema.safeParse({
				type: "chat.v1.message_sent",
				payload: {
					messageId: "m1",
					conversationId: "1:2",
					senderId: 7,
					timestamp: 1,
					unsent: false,
					reactions: [],
					type: "Text",
					body: { text: "hi" },
				},
			}).success,
		).toBe(true);
	});

	it("accepts a command response that carries no payload", () => {
		expect(
			commandResponseEventSchema.safeParse({
				type: "chat.v1.message.send.response",
				ref: "r-1",
				status: 200,
			}).success,
		).toBe(true);
	});

	it("rejects an event whose payload does not match its type", () => {
		expect(
			chatV1ConversationDeleteEventSchema.safeParse({
				type: "chat.v1.conversation.delete",
				payload: { conversationIds: "1:2" },
			}).success,
		).toBe(false);
	});
});
