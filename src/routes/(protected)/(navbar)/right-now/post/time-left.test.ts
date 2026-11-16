import { describe, expect, it } from "vitest";

import { formatTimeLeft } from "./time-left";

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;

describe("formatTimeLeft", () => {
	it.each([
		[HOUR + 5 * MINUTE, "1h 5m"],
		[HOUR, "1h"],
		[2 * HOUR + 59 * MINUTE + 59 * SECOND, "2h 59m"],
		[45 * MINUTE, "45m"],
		[59 * MINUTE + 59 * SECOND, "59m"],
		[MINUTE, "1m"],
		[59 * SECOND, "59s"],
		[30 * SECOND, "30s"],
		[29 * SECOND + 1, "30s"],
		[1, "1s"],
		[0, "0s"],
		[-5 * SECOND, "0s"],
	])("formats %i ms as %s", (ms, expected) => {
		expect(formatTimeLeft({ ms })).toBe(expected);
	});
});
