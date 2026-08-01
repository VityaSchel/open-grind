import { afterEach, describe, expect, it, vi } from "vitest";

import { formatTimeRelativeCustom } from "$lib/util/format-time";

afterEach(() => {
	vi.useRealTimers();
});

describe("formatTimeRelativeCustom", () => {
	it("formats recent and older timestamps relative to now", () => {
		vi.setSystemTime(new Date("2026-06-10T12:00:00Z"));

		expect(formatTimeRelativeCustom(Date.now() - 30_000)).toBe("Just now");
		expect(formatTimeRelativeCustom(Date.now() - 2 * 60_000)).toBe("2 mins");
		expect(formatTimeRelativeCustom(Date.now() - 2 * 60 * 60_000)).toBe(
			"2 hrs",
		);
		expect(formatTimeRelativeCustom(Date.now() - 25 * 60 * 60_000)).toBe(
			"Yesterday",
		);
	});

	it("returns an empty label for negative timestamps", () => {
		expect(formatTimeRelativeCustom(-1)).toBe("");
	});
});
