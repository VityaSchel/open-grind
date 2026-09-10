import { describe, expect, it } from "vitest";

import type { Conversation } from "$lib/model/messaging/conversations";
import {
	conversation,
	partialConversation,
} from "./conversations-test-helpers";
import { mergeConversation } from "./merge-conversation";

const merge = ({
	existing,
	incoming,
	pendingFlags = [],
	keepUnreadCount = false,
}: {
	existing: Conversation;
	incoming: Conversation;
	pendingFlags?: ("pinned" | "muted")[];
	keepUnreadCount?: boolean;
}) => {
	mergeConversation({ existing, incoming, pendingFlags, keepUnreadCount });
	return existing.data;
};

describe("mergeConversation", () => {
	it("takes the incoming values of a full entry", () => {
		const existing = conversation("a:1", 1000, { name: "Old" });
		const incoming = conversation("a:1", 2000, {
			name: "New",
			pinned: true,
			unreadCount: 3,
		});

		const merged = merge({ existing, incoming });

		expect(merged.name).toBe("New");
		expect(merged.pinned).toBe(true);
		expect(merged.lastActivityTimestamp).toBe(2000);
		expect(merged.unreadCount).toBe(3);
	});

	it("keeps the unread count of the conversation being read", () => {
		const existing = conversation("a:1", 1000, { unreadCount: 0 });
		const incoming = conversation("a:1", 2000, { unreadCount: 7 });

		expect(
			merge({ existing, incoming, keepUnreadCount: true }).unreadCount,
		).toBe(0);
	});

	it("keeps a flag whose request is still in flight", () => {
		const existing = conversation("a:1", 1000, { pinned: true });
		const incoming = conversation("a:1", 2000, { pinned: false });

		expect(
			merge({ existing, incoming, pendingFlags: ["pinned"] }).pinned,
		).toBe(true);
	});

	it("keeps the flags a partial entry never carries", () => {
		const existing = conversation("a:1", 1000, {
			muted: true,
			pinned: true,
			favorite: true,
			rightNow: "HOSTING",
			hasUnreadThrob: true,
		});
		const incoming = partialConversation(
			conversation("a:1", 2000, { name: "New" }),
		);

		const merged = merge({ existing, incoming });

		expect(merged).toMatchObject({
			name: "New",
			lastActivityTimestamp: 2000,
			muted: true,
			pinned: true,
			favorite: true,
			rightNow: "HOSTING",
			hasUnreadThrob: true,
		});
	});

	it("takes on the kind of entry the server just sent", () => {
		const existing = partialConversation(conversation("a:1", 1000));
		const incoming = conversation("a:1", 2000, { pinned: true });

		merge({ existing, incoming });

		expect(existing.type).toBe("full_conversation_v1");
		expect(existing.data.pinned).toBe(true);
	});

	it("still takes the fields a partial entry does carry", () => {
		const existing = conversation("a:1", 1000, { unreadCount: 0 });
		const incoming = partialConversation(
			conversation("a:1", 2000, {
				unreadCount: 4,
				preview: { type: "Text", text: "hi" },
			}),
		);

		const merged = merge({ existing, incoming });

		expect(merged.unreadCount).toBe(4);
		expect(merged.preview?.text).toBe("hi");
	});
});
