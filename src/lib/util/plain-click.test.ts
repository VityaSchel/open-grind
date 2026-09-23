import { describe, expect, it } from "vitest";

import { isPlainClick } from "$lib/util/plain-click";

describe("isPlainClick", () => {
	it("accepts a primary click without modifiers", () => {
		expect(isPlainClick(new MouseEvent("click", { button: 0 }))).toBe(true);
	});

	it.each(["metaKey", "ctrlKey", "shiftKey", "altKey"] as const)(
		"rejects a click holding %s",
		(modifier) => {
			expect(
				isPlainClick(
					new MouseEvent("click", { button: 0, [modifier]: true }),
				),
			).toBe(false);
		},
	);

	it("rejects a middle or secondary button", () => {
		expect(isPlainClick(new MouseEvent("click", { button: 1 }))).toBe(
			false,
		);
		expect(isPlainClick(new MouseEvent("click", { button: 2 }))).toBe(
			false,
		);
	});
});
