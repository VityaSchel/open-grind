import { describe, expect, it } from "vitest";

import { PendingDeletes } from "./pending-deletes";

describe("PendingDeletes", () => {
	it("blocks a conversation while its delete is in flight", () => {
		const deletes = new PendingDeletes();
		deletes.mark("a:1");

		expect(deletes.blocks("a:1", 7)).toBe(true);
	});

	it("keeps blocking fetches that started at or before the settling epoch", () => {
		const deletes = new PendingDeletes();
		deletes.mark("a:1");
		deletes.settle("a:1", 3);

		expect(deletes.blocks("a:1", 3)).toBe(true);
		expect(deletes.blocks("a:1", 4)).toBe(false);
	});

	it("stays in flight until every overlapping delete settles", () => {
		const deletes = new PendingDeletes();
		deletes.mark("a:1");
		deletes.mark("a:1");
		deletes.settle("a:1", 3);

		expect(deletes.blocks("a:1", 9)).toBe(true);

		deletes.settle("a:1", 3);

		expect(deletes.blocks("a:1", 9)).toBe(false);
	});

	it("forgets the conversation only once every reference is released", () => {
		const deletes = new PendingDeletes();
		deletes.mark("a:1");
		deletes.mark("a:1");
		deletes.settle("a:1", 3);
		deletes.settle("a:1", 3);
		deletes.release("a:1");

		expect(deletes.blocks("a:1", 3)).toBe(true);

		deletes.release("a:1");

		expect(deletes.blocks("a:1", 3)).toBe(false);
	});

	it("ignores settle and release for an unknown conversation", () => {
		const deletes = new PendingDeletes();
		deletes.settle("a:1", 3);
		deletes.release("a:1");

		expect(deletes.blocks("a:1", 0)).toBe(false);
	});
});
