import { describe, expect, it } from "vitest";

import {
	type SliderScale,
	TRACK_RESOLUTION,
} from "$lib/components/ui/slider/scale";
import {
	AGE_SLIDER_SCALE,
	taperedScale,
	WEIGHT_SLIDER_SCALE,
} from "./slider-scale";

const valuesOf = ({ min, max }: SliderScale) =>
	Array.from({ length: max - min + 1 }, (_, offset) => min + offset);

const stepWidthsOf = ({ positions }: SliderScale) =>
	positions.slice(1).map((position, index) => position - positions[index]!);

const trackShareUpTo = ({
	scale,
	value,
}: {
	scale: SliderScale;
	value: number;
}) => scale.toPosition(value) / TRACK_RESOLUTION;

describe.each([
	{ name: "age", scale: AGE_SLIDER_SCALE, knee: 45 },
	{ name: "weight", scale: WEIGHT_SLIDER_SCALE, knee: 105 },
])("$name scale", ({ scale, knee }) => {
	it("returns every whole value from its own position", () => {
		for (const value of valuesOf(scale))
			expect(scale.toValue(scale.toPosition(value))).toBe(value);
	});

	it("reads the nearest value from any point on the track", () => {
		for (const value of valuesOf(scale).slice(1, -1)) {
			const position = scale.toPosition(value);
			const below = scale.toPosition(value - 1);
			const above = scale.toPosition(value + 1);
			expect(scale.toValue(Math.ceil((below + position) / 2 + 1))).toBe(
				value,
			);
			expect(scale.toValue(Math.floor((position + above) / 2 - 1))).toBe(
				value,
			);
		}
	});

	it("moves right as the value grows", () => {
		for (const width of stepWidthsOf(scale))
			expect(width).toBeGreaterThan(0);
	});

	it("spans the whole track", () => {
		expect(scale.toPosition(scale.min)).toBe(0);
		expect(scale.toPosition(scale.max)).toBe(TRACK_RESOLUTION);
		expect(scale.toValue(-1)).toBe(scale.min);
		expect(scale.toValue(TRACK_RESOLUTION + 1)).toBe(scale.max);
	});

	it("keeps steps equal up to the knee", () => {
		const widths = stepWidthsOf(scale).slice(0, knee - scale.min);
		expect(Math.max(...widths) - Math.min(...widths)).toBeLessThanOrEqual(
			1,
		);
	});

	it("narrows each step past the knee by at most a tenth", () => {
		const widths = stepWidthsOf(scale);
		for (let index = 1; index < widths.length; index++) {
			expect(widths[index]!).toBeLessThanOrEqual(widths[index - 1]! + 1);
			expect(widths[index]!).toBeGreaterThanOrEqual(
				widths[index - 1]! * 0.9,
			);
		}
	});
});

describe("age scale", () => {
	it("gives ages 18 to 45 about three fifths of the track", () => {
		const share = trackShareUpTo({ scale: AGE_SLIDER_SCALE, value: 45 });
		expect(share).toBeGreaterThan(0.58);
		expect(share).toBeLessThan(0.62);
	});

	it("makes a year near 99 about seven times narrower than near 18", () => {
		const widths = stepWidthsOf(AGE_SLIDER_SCALE);
		expect(widths[0]! / widths.at(-1)!).toBeCloseTo(7, 0);
	});
});

describe("weight scale", () => {
	it("gives weights up to 105 kg about three fifths of the track", () => {
		const share = trackShareUpTo({
			scale: WEIGHT_SLIDER_SCALE,
			value: 105,
		});
		expect(share).toBeGreaterThan(0.58);
		expect(share).toBeLessThan(0.62);
	});
});

describe("taperedScale", () => {
	it("rejects a taper that would put two values on one position", () => {
		expect(() =>
			taperedScale({ min: 18, max: 99, knee: 45, taper: 1_000_000 }),
		).toThrow(/share a track position/);
	});

	it("rejects a knee outside the range", () => {
		expect(() =>
			taperedScale({ min: 18, max: 99, knee: 99, taper: 6 }),
		).toThrow(RangeError);
	});

	it("rejects a taper that does not narrow the steps", () => {
		expect(() =>
			taperedScale({ min: 18, max: 99, knee: 45, taper: 1 }),
		).toThrow(RangeError);
	});
});
