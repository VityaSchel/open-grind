import { describe, expect, it } from "vitest";

import { PendingDeletes } from "./pending-deletes";

describe("PendingDeletes", () => {
	it("blocks a conversation while its delete is in flight", () => {
		const deletes = new PendingDeletes();
		deletes.mark("a:1");

		expect(deletes.blocks({ conversationId: "a:1", fetchEpoch: 7 })).toBe(
			true,
		);
	});

	it("keeps blocking fetches that started at or before the settling epoch", () => {
		const deletes = new PendingDeletes();
		deletes.mark("a:1");
		deletes.settle({ conversationId: "a:1", fetchEpoch: 3 });

		expect(deletes.blocks({ conversationId: "a:1", fetchEpoch: 3 })).toBe(
			true,
		);
		expect(deletes.blocks({ conversationId: "a:1", fetchEpoch: 4 })).toBe(
			false,
		);
	});

	it("stays in flight until every overlapping delete settles", () => {
		const deletes = new PendingDeletes();
		deletes.mark("a:1");
		deletes.mark("a:1");
		deletes.settle({ conversationId: "a:1", fetchEpoch: 3 });

		expect(deletes.blocks({ conversationId: "a:1", fetchEpoch: 9 })).toBe(
			true,
		);

		deletes.settle({ conversationId: "a:1", fetchEpoch: 3 });

		expect(deletes.blocks({ conversationId: "a:1", fetchEpoch: 9 })).toBe(
			false,
		);
	});

	it("forgets the conversation only once every reference is released", () => {
		const deletes = new PendingDeletes();
		deletes.mark("a:1");
		deletes.mark("a:1");
		deletes.settle({ conversationId: "a:1", fetchEpoch: 3 });
		deletes.settle({ conversationId: "a:1", fetchEpoch: 3 });
		deletes.release("a:1");

		expect(deletes.blocks({ conversationId: "a:1", fetchEpoch: 3 })).toBe(
			true,
		);

		deletes.release("a:1");

		expect(deletes.blocks({ conversationId: "a:1", fetchEpoch: 3 })).toBe(
			false,
		);
	});

	it("ignores settle and release for an unknown conversation", () => {
		const deletes = new PendingDeletes();
		deletes.settle({ conversationId: "a:1", fetchEpoch: 3 });
		deletes.release("a:1");

		expect(deletes.blocks({ conversationId: "a:1", fetchEpoch: 0 })).toBe(
			false,
		);
	});
});
