import { describe, expect, it } from "vitest";

import { UnreadWhileMissing } from "./unread-while-missing";

describe("UnreadWhileMissing", () => {
	it("hands back every arrival it was told about", () => {
		const counts = new UnreadWhileMissing();
		counts.add("a:1");
		counts.add("a:1");
		counts.add("a:1");

		expect(counts.take("a:1")).toBe(3);
	});

	it("counts each conversation on its own", () => {
		const counts = new UnreadWhileMissing();
		counts.add("a:1");
		counts.add("b:2");

		expect(counts.take("a:1")).toBe(1);
		expect(counts.take("b:2")).toBe(1);
	});

	it("empties a conversation once it has been taken", () => {
		const counts = new UnreadWhileMissing();
		counts.add("a:1");
		counts.take("a:1");

		expect(counts.take("a:1")).toBe(0);
	});

	it("gives back a single arrival on drop", () => {
		const counts = new UnreadWhileMissing();
		counts.add("a:1");
		counts.add("a:1");
		counts.drop("a:1");

		expect(counts.take("a:1")).toBe(1);
	});

	it("ignores a drop for a conversation it knows nothing about", () => {
		const counts = new UnreadWhileMissing();
		counts.drop("a:1");

		expect(counts.take("a:1")).toBe(0);
	});
});
