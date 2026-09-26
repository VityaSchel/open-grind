import { describe, expect, it } from "vitest";

import { firedByTouch } from "./touch-origin";

function eventWith(hints: Record<string, unknown>): Event {
	return Object.assign(new Event("contextmenu"), hints);
}

describe("firedByTouch", () => {
	it("is true for a touch or pen pointer", () => {
		expect(firedByTouch(eventWith({ pointerType: "touch" }))).toBe(true);
		expect(firedByTouch(eventWith({ pointerType: "pen" }))).toBe(true);
	});

	it("is true for an event whose source fires touch events", () => {
		expect(
			firedByTouch(
				eventWith({ sourceCapabilities: { firesTouchEvents: true } }),
			),
		).toBe(true);
	});

	it("is false for a mouse, the keyboard or an unknown source", () => {
		expect(firedByTouch(eventWith({ pointerType: "mouse" }))).toBe(false);
		expect(firedByTouch(eventWith({ pointerType: "" }))).toBe(false);
		expect(
			firedByTouch(
				eventWith({ sourceCapabilities: { firesTouchEvents: false } }),
			),
		).toBe(false);
		expect(firedByTouch(eventWith({ sourceCapabilities: null }))).toBe(
			false,
		);
		expect(firedByTouch(new Event("contextmenu"))).toBe(false);
	});
});
