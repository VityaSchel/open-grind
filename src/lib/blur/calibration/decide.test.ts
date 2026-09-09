import { describe, expect, it } from "vitest";

import {
	MAX_PAIRS,
	MEDIUM_MIN_PAIRS,
	REFERENCE_PERIOD_MS,
	SMOOTH_MIN_PAIRS,
} from "./constants";
import {
	backdropBlurCalibrationSchema,
	decideTrial,
	otherArm,
	pairFirstArm,
	type TrialSample,
} from "./decide";

const SMOOTH: TrialSample = [REFERENCE_PERIOD_MS, REFERENCE_PERIOD_MS];
const STRUGGLING: TrialSample = [20, REFERENCE_PERIOD_MS];
const fill = (sample: TrialSample, count: number) =>
	Array.from({ length: count }, () => sample);
const periodMs = (fps: number) => 1000 / fps;

describe("decideTrial", () => {
	it("waits while the evidence is thin", () => {
		expect(decideTrial([])).toBeNull();
		expect(decideTrial(fill(SMOOTH, SMOOTH_MIN_PAIRS - 1))).toBeNull();
		expect(decideTrial(fill(STRUGGLING, MEDIUM_MIN_PAIRS - 1))).toBeNull();
	});

	it("keeps max as soon as max itself holds 60 fps", () => {
		expect(decideTrial(fill(SMOOTH, SMOOTH_MIN_PAIRS))).toBe("max");
	});

	it("picks medium only when max consistently costs frames", () => {
		expect(decideTrial(fill(STRUGGLING, MEDIUM_MIN_PAIRS))).toBe("medium");
	});

	it("does not let one janky pair carry the verdict", () => {
		const samples = [
			...fill(SMOOTH, MEDIUM_MIN_PAIRS - 1),
			[50, REFERENCE_PERIOD_MS] satisfies TrialSample,
		];
		expect(decideTrial(samples)).not.toBe("medium");
	});

	it("keeps full blur when nothing was ever demonstrated", () => {
		const noisy = fill([17.5, 17.4], MAX_PAIRS);
		expect(decideTrial(noisy)).toBe("max");
	});

	it("never treats a 120 Hz panel as a failure", () => {
		const highRefresh: TrialSample = [periodMs(105), periodMs(116)];
		expect(decideTrial(fill(highRefresh, MAX_PAIRS))).toBe("max");
	});
});

describe("pair ordering", () => {
	it("alternates which arm leads so drift cancels across pairs", () => {
		expect(pairFirstArm(0)).toBe("max");
		expect(pairFirstArm(1)).toBe("medium");
		expect(pairFirstArm(5)).toBe("medium");
		expect(otherArm("max")).toBe("medium");
		expect(otherArm("medium")).toBe("max");
	});
});

describe("backdropBlurCalibrationSchema", () => {
	it("stores shape only, so retuning a constant never wipes a stored trial", () => {
		const samples = fill(SMOOTH, MAX_PAIRS + 1);
		expect(
			backdropBlurCalibrationSchema.parse({ quality: "max", samples })
				.samples,
		).toHaveLength(MAX_PAIRS + 1);
	});

	it("round-trips an unfinished trial", () => {
		const value = { quality: null, samples: [[20, 16.7]] };
		expect(backdropBlurCalibrationSchema.parse(value)).toEqual(value);
	});
});
