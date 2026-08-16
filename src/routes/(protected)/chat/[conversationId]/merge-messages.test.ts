import { describe, expect, it } from "vitest";

import type { ApiResponseMessage } from "$lib/model/messaging/messages";
import { mergeServerMessages, type OptimisticMessage } from "./merge-messages";

function message(messageId: string, timestamp: number): ApiResponseMessage {
	return {
		messageId,
		conversationId: "1:2",
		senderId: 2,
		timestamp,
		unsent: false,
		reactions: [],
		type: "Text",
		body: { text: messageId },
	} as unknown as ApiResponseMessage;
}

const sent = (id: string, timestamp: number): OptimisticMessage => ({
	...message(id, timestamp),
	status: "sent",
});

describe("mergeServerMessages", () => {
	it("empties the thread when the server has nothing left", () => {
		const result = mergeServerMessages({
			local: [sent("b", 2000), sent("a", 1000)],
			server: [],
		});

		expect(result.messages).toEqual([]);
		expect(result.changed).toBe(true);
	});

	it("keeps unsent work in progress when the server empties the thread", () => {
		const pending: OptimisticMessage = {
			...message("draft", 3000),
			status: "pending",
		};

		const result = mergeServerMessages({
			local: [pending, sent("a", 1000)],
			server: [],
		});

		expect(result.messages).toEqual([pending]);
		expect(result.changed).toBe(true);
	});

	it("still keeps messages older than a partial server page", () => {
		const older = sent("a", 1000);

		const result = mergeServerMessages({
			local: [sent("b", 2000), older],
			server: [message("b", 2000)],
		});

		expect(result.messages.map((m) => m.messageId)).toEqual(["b", "a"]);
		expect(result.changed).toBe(false);
	});
});
