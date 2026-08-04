import { describe, expect, it } from "vitest";

import { PendingFlags } from "./pending-flags";

describe("PendingFlags", () => {
	it("reports the fields currently in flight for a conversation", () => {
		const flags = new PendingFlags<"pinned" | "muted">();
		flags.mark({ conversationId: "a:1", field: "pinned" });
		flags.mark({ conversationId: "a:1", field: "muted" });

		expect(flags.fields("a:1").toSorted()).toEqual(["muted", "pinned"]);
		expect(flags.fields("b:2")).toEqual([]);
	});

	it("keeps a field in flight until every overlapping request unmarks it", () => {
		const flags = new PendingFlags<"pinned">();
		flags.mark({ conversationId: "a:1", field: "pinned" });
		flags.mark({ conversationId: "a:1", field: "pinned" });
		flags.unmark({ conversationId: "a:1", field: "pinned" });

		expect(flags.fields("a:1")).toEqual(["pinned"]);

		flags.unmark({ conversationId: "a:1", field: "pinned" });

		expect(flags.fields("a:1")).toEqual([]);
	});

	it("unmarks one field without disturbing the other", () => {
		const flags = new PendingFlags<"pinned" | "muted">();
		flags.mark({ conversationId: "a:1", field: "pinned" });
		flags.mark({ conversationId: "a:1", field: "muted" });
		flags.unmark({ conversationId: "a:1", field: "pinned" });

		expect(flags.fields("a:1")).toEqual(["muted"]);
	});

	it("ignores unmark for a field that was never marked", () => {
		const flags = new PendingFlags<"pinned" | "muted">();
		flags.mark({ conversationId: "a:1", field: "pinned" });
		flags.unmark({ conversationId: "a:1", field: "muted" });
		flags.unmark({ conversationId: "b:2", field: "pinned" });

		expect(flags.fields("a:1")).toEqual(["pinned"]);
	});
});
