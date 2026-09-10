import { describe, expect, it } from "vitest";

import { sortConversations } from "./conversation-order";
import { conversation } from "./conversations-test-helpers";

const ids = (entries: ReturnType<typeof sortConversations>) =>
	entries.map((entry) => entry.data.conversationId);

describe("sortConversations", () => {
	it("puts the newest activity first", () => {
		const sorted = sortConversations([
			conversation("older", 1000),
			conversation("newest", 3000),
			conversation("newer", 2000),
		]);

		expect(ids(sorted)).toEqual(["newest", "newer", "older"]);
	});

	it("floats pinned conversations above newer unpinned ones", () => {
		const sorted = sortConversations([
			conversation("newest", 3000),
			conversation("pinned-oldest", 1000, { pinned: true }),
			conversation("newer", 2000),
		]);

		expect(ids(sorted)).toEqual(["pinned-oldest", "newest", "newer"]);
	});

	it("orders pinned conversations among themselves by activity", () => {
		const sorted = sortConversations([
			conversation("pinned-older", 1000, { pinned: true }),
			conversation("pinned-newer", 2000, { pinned: true }),
		]);

		expect(ids(sorted)).toEqual(["pinned-newer", "pinned-older"]);
	});

	it("leaves the given array untouched", () => {
		const entries = [conversation("a", 1000), conversation("b", 2000)];

		sortConversations(entries);

		expect(ids(entries)).toEqual(["a", "b"]);
	});
});
