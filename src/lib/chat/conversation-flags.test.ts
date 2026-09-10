import { describe, expect, it } from "vitest";

import { RememberedConversationFlags } from "./conversation-flags";
import {
	conversation,
	partialConversation,
} from "./conversations-test-helpers";

const pinnedAndStarred = { pinned: true, favorite: true, muted: true };

describe("RememberedConversationFlags", () => {
	it("gives a partial entry the flags its full entry carried", () => {
		const flags = new RememberedConversationFlags();
		flags.applyTo([conversation("a:1", 2000, pinnedAndStarred)]);

		const [restored] = flags.applyTo([
			partialConversation(conversation("a:1", 3000)),
		]);

		expect(restored?.data).toMatchObject(pinnedAndStarred);
	});

	it("leaves a partial entry alone when no full entry was ever seen", () => {
		const flags = new RememberedConversationFlags();

		const [untouched] = flags.applyTo([
			partialConversation(conversation("b:2", 1000)),
		]);

		expect(untouched?.data).toMatchObject({
			pinned: false,
			favorite: false,
			muted: false,
		});
	});

	it("follows the newest full entry", () => {
		const flags = new RememberedConversationFlags();
		flags.applyTo([conversation("a:1", 1000, pinnedAndStarred)]);
		flags.applyTo([conversation("a:1", 2000, { pinned: false })]);

		const [restored] = flags.applyTo([
			partialConversation(conversation("a:1", 3000)),
		]);

		expect(restored?.data.pinned).toBe(false);
	});

	it("lets a flag set on a seeded partial entry stand", () => {
		const flags = new RememberedConversationFlags();
		flags.applyTo([conversation("a:1", 1000, { pinned: false })]);
		const gated = partialConversation(conversation("a:1", 2000));
		flags.applyTo([gated]);

		gated.data.pinned = true;
		flags.applyTo([gated]);

		expect(gated.data.pinned).toBe(true);
	});

	it("carries a flag set on a partial entry into the next one", () => {
		const flags = new RememberedConversationFlags();
		flags.applyTo([conversation("a:1", 1000, { pinned: false })]);
		const gated = partialConversation(conversation("a:1", 2000));
		flags.applyTo([gated]);
		gated.data.pinned = true;
		flags.applyTo([gated]);

		const [reloaded] = flags.applyTo([
			partialConversation(conversation("a:1", 3000)),
		]);

		expect(reloaded?.data.pinned).toBe(true);
	});

	it("keeps the fields a partial entry does carry", () => {
		const flags = new RememberedConversationFlags();
		flags.applyTo([
			conversation("a:1", 1000, { ...pinnedAndStarred, unreadCount: 0 }),
		]);

		const [restored] = flags.applyTo([
			partialConversation(conversation("a:1", 3000, { unreadCount: 5 })),
		]);

		expect(restored?.data.unreadCount).toBe(5);
		expect(restored?.data.lastActivityTimestamp).toBe(3000);
	});
});
