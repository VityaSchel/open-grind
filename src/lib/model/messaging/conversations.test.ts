import { describe, expect, it } from "vitest";

import {
	conversationEntrySchema,
	fullConversationSchema,
} from "$lib/model/messaging/conversations";

function conversation(data: Record<string, unknown> = {}) {
	return {
		type: "full_conversation_v1",
		data: {
			conversationId: "conversation-1",
			name: "Alex",
			participants: [{ profileId: 42 }],
			lastActivityTimestamp: 1_710_000_000_000,
			unreadCount: 0,
			...data,
		},
	};
}

describe("fullConversationSchema", () => {
	it("accepts an entry carrying only what the server guarantees", () => {
		const parsed = fullConversationSchema.parse(conversation());

		expect(parsed.data.muted).toBe(false);
		expect(parsed.data.pinned).toBe(false);
		expect(parsed.data.favorite).toBe(false);
		expect(parsed.data.hasUnreadThrob).toBe(false);
		expect(parsed.data.rightNow).toBe("NOT_ACTIVE");
	});

	it("accepts a participant described only by its id", () => {
		const parsed = fullConversationSchema.parse(conversation());

		expect(parsed.data.participants[0]?.profileId).toBe(42);
		expect(parsed.data.participants[0]?.isInAList).toBe(false);
	});

	it.each([
		["a group", [{ profileId: 1 }, { profileId: 2 }]],
		["nobody", []],
	])("accepts a conversation with %s in it", (_, participants) => {
		expect(
			fullConversationSchema.safeParse(conversation({ participants }))
				.success,
		).toBe(true);
	});

	it("still rejects an entry with no conversationId", () => {
		const { data } = conversation();
		const incomplete: Record<string, unknown> = { ...data };
		delete incomplete.conversationId;

		expect(
			fullConversationSchema.safeParse({
				type: "full_conversation_v1",
				data: incomplete,
			}).success,
		).toBe(false);
	});
});

describe("conversationEntrySchema", () => {
	it("accepts the entry type the server sends today", () => {
		expect(conversationEntrySchema.safeParse(conversation()).success).toBe(
			true,
		);
	});

	it("rejects an entry type it does not model, so the list can drop it", () => {
		expect(
			conversationEntrySchema.safeParse({
				...conversation(),
				type: "group_conversation_v1",
			}).success,
		).toBe(false);
	});
});
