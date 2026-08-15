import { describe, expect, it } from "vitest";

import { SeenMessages } from "./seen-messages";

describe("SeenMessages", () => {
	it("recognizes a message it has already been told about", () => {
		const seen = new SeenMessages();
		seen.mark("m-1");

		expect(seen.has("m-1")).toBe(true);
		expect(seen.has("m-2")).toBe(false);
	});

	it("forgets the oldest ids once it is full", () => {
		const seen = new SeenMessages({ capacity: 2 });
		seen.mark("m-1");
		seen.mark("m-2");
		seen.mark("m-3");

		expect(seen.has("m-1")).toBe(false);
		expect(seen.has("m-2")).toBe(true);
		expect(seen.has("m-3")).toBe(true);
	});

	it("forgets an id it was told to unmark", () => {
		const seen = new SeenMessages();
		seen.mark("m-1");
		seen.unmark("m-1");

		expect(seen.has("m-1")).toBe(false);
	});

	it("does not shrink when the same id is marked twice", () => {
		const seen = new SeenMessages({ capacity: 2 });
		seen.mark("m-1");
		seen.mark("m-1");
		seen.mark("m-2");

		expect(seen.has("m-1")).toBe(true);
		expect(seen.has("m-2")).toBe(true);
	});
});
