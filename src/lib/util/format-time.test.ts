import { afterEach, describe, expect, it, vi } from "vitest";

import {
	formatMediaDuration,
	formatTimeRelativeCustom,
} from "$lib/util/format-time";

afterEach(() => {
	vi.useRealTimers();
});

describe("formatTimeRelativeCustom", () => {
	it("formats recent and older timestamps relative to now", () => {
		vi.setSystemTime(new Date("2026-06-10T12:00:00Z"));

		expect(formatTimeRelativeCustom(Date.now() - 30_000)).toBe("Just now");
		expect(formatTimeRelativeCustom(Date.now() - 2 * 60_000)).toBe(
			"2 mins",
		);
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

describe("formatMediaDuration", () => {
	it("pads seconds but not the leading unit", () => {
		expect(formatMediaDuration(0)).toBe("0:00");
		expect(formatMediaDuration(9)).toBe("0:09");
		expect(formatMediaDuration(75)).toBe("1:15");
		expect(formatMediaDuration(600)).toBe("10:00");
	});

	it("grows an hours field only past an hour", () => {
		expect(formatMediaDuration(3599)).toBe("59:59");
		expect(formatMediaDuration(3600)).toBe("1:00:00");
		expect(formatMediaDuration(3661)).toBe("1:01:01");
	});

	it("truncates rather than rounds, so the clock never overshoots", () => {
		expect(formatMediaDuration(59.9)).toBe("0:59");
	});

	it("reads as zero before metadata arrives", () => {
		expect(formatMediaDuration(NaN)).toBe("0:00");
		expect(formatMediaDuration(Infinity)).toBe("0:00");
		expect(formatMediaDuration(-5)).toBe("0:00");
	});
});
