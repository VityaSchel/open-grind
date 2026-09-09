import { describe, expect, it } from "vitest";

import { REFERENCE_PERIOD_MS } from "./constants";
import { clippedMeanMs, dropFraction } from "./gesture";

const repeat = (pattern: readonly number[], times: number) =>
	Array.from({ length: times }, () => pattern).flat();

describe("dropFraction", () => {
	it("measures frames missed against a 60 fps budget, not the panel", () => {
		expect(dropFraction(REFERENCE_PERIOD_MS)).toBeCloseTo(0, 6);
		expect(dropFraction(1000 / 120)).toBe(0);
		expect(dropFraction(1000 / 30)).toBeCloseTo(0.5, 6);
		expect(dropFraction(25)).toBeCloseTo(1 / 3, 6);
	});

	it("reports nothing measurable for an empty or degenerate mean", () => {
		expect(dropFraction(Number.NaN)).toBeNaN();
		expect(dropFraction(0)).toBeNaN();
	});
});

describe("clippedMeanMs", () => {
	it("bounds one main-thread stall so it cannot fake a medium verdict", () => {
		const intervals = [...repeat([REFERENCE_PERIOD_MS], 39), 200];
		expect(dropFraction(clippedMeanMs(intervals))).toBeLessThanOrEqual(
			0.05,
		);
		const raw =
			intervals.reduce((total, value) => total + value, 0) /
			intervals.length;
		expect(dropFraction(raw)).toBeGreaterThan(0.2);
	});

	it("leaves a genuine one-in-five dropped frame untouched", () => {
		const intervals = repeat(
			[
				REFERENCE_PERIOD_MS,
				REFERENCE_PERIOD_MS,
				REFERENCE_PERIOD_MS,
				REFERENCE_PERIOD_MS,
				2 * REFERENCE_PERIOD_MS,
			],
			8,
		);
		expect(clippedMeanMs(intervals)).toBeCloseTo(1.2 * REFERENCE_PERIOD_MS);
		expect(dropFraction(clippedMeanMs(intervals))).toBeCloseTo(1 / 6, 6);
	});

	it("is a no-op below the clip and saturates above it", () => {
		expect(clippedMeanMs([3 * REFERENCE_PERIOD_MS])).toBeCloseTo(
			3 * REFERENCE_PERIOD_MS,
		);
		expect(clippedMeanMs([10_000])).toBeCloseTo(3 * REFERENCE_PERIOD_MS);
		expect(clippedMeanMs([])).toBeNaN();
	});
});
