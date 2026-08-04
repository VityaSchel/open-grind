import { describe, expect, it } from "vitest";

import { PendingFlags } from "./pending-flags";

describe("PendingFlags", () => {
	it("reports the fields currently in flight for a conversation", () => {
		const flags = new PendingFlags<"pinned" | "muted">();
		flags.mark("a:1", "pinned");
		flags.mark("a:1", "muted");

		expect(flags.fields("a:1").toSorted()).toEqual(["muted", "pinned"]);
		expect(flags.fields("b:2")).toEqual([]);
	});

	it("keeps a field in flight until every overlapping request unmarks it", () => {
		const flags = new PendingFlags<"pinned">();
		flags.mark("a:1", "pinned");
		flags.mark("a:1", "pinned");
		flags.unmark("a:1", "pinned");

		expect(flags.fields("a:1")).toEqual(["pinned"]);

		flags.unmark("a:1", "pinned");

		expect(flags.fields("a:1")).toEqual([]);
	});

	it("unmarks one field without disturbing the other", () => {
		const flags = new PendingFlags<"pinned" | "muted">();
		flags.mark("a:1", "pinned");
		flags.mark("a:1", "muted");
		flags.unmark("a:1", "pinned");

		expect(flags.fields("a:1")).toEqual(["muted"]);
	});

	it("ignores unmark for a field that was never marked", () => {
		const flags = new PendingFlags<"pinned" | "muted">();
		flags.mark("a:1", "pinned");
		flags.unmark("a:1", "muted");
		flags.unmark("b:2", "pinned");

		expect(flags.fields("a:1")).toEqual(["pinned"]);
	});
});
