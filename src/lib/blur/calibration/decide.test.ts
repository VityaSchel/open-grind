import { describe, expect, it } from "vitest";

import {
	DEMOTE_MIN_DROP,
	DEMOTE_MIN_PAIRS,
	MAX_PAIRS,
	REFERENCE_PERIOD_MS,
	SMOOTH_MAX_DROP,
	SMOOTH_MIN_PAIRS,
	STALLED_MIN_PAIRS,
} from "./constants";
import {
	backdropBlurCalibrationSchema,
	firstRung,
	nextStep,
	otherArm,
	pairFirstArm,
	type Rung,
	type TrialSample,
} from "./decide";
import { CLIP_MS } from "./gesture";

const SMOOTH: TrialSample = [REFERENCE_PERIOD_MS, REFERENCE_PERIOD_MS];
const STRUGGLING: TrialSample = [20, REFERENCE_PERIOD_MS];
const STALLED: TrialSample = [CLIP_MS, CLIP_MS];
const fill = (sample: TrialSample, count: number) =>
	Array.from({ length: count }, () => sample);
const periodMs = (fps: number) => 1000 / fps;
const step = (
	samples: readonly TrialSample[],
	{
		rung = "max",
		climbing = false,
	}: { rung?: Rung; climbing?: boolean } = {},
) => nextStep({ rung, samples, climbing });

const WEBKITGTK_2_52_LAPTOP: TrialSample[] = [
	[29.25, 26.61],
	[27.43, 27.34],
	[30.86, 25.61],
	[29.17, 26.38],
	[30.45, 26.26],
	[26.62, 28],
	[31.55, 24.93],
	[27.24, 28.16],
	[30.46, 26.27],
	[28.36, 26.63],
];

describe("nextStep", () => {
	it("waits while the evidence is thin", () => {
		expect(step([])).toBeNull();
		expect(step(fill(SMOOTH, SMOOTH_MIN_PAIRS - 1))).toBeNull();
		expect(step(fill(STRUGGLING, DEMOTE_MIN_PAIRS - 1))).toBeNull();
		expect(step(fill(STALLED, STALLED_MIN_PAIRS - 1))).toBeNull();
	});

	it("keeps the upper arm as soon as it holds 60 fps", () => {
		expect(step(fill(SMOOTH, SMOOTH_MIN_PAIRS))).toEqual({ settle: "max" });
		expect(
			step(fill(SMOOTH, SMOOTH_MIN_PAIRS), { rung: "medium" }),
		).toEqual({ settle: "medium" });
	});

	it("steps down a rung when the lower arm wins consistently while the upper misses 60 fps", () => {
		expect(step(fill(STRUGGLING, DEMOTE_MIN_PAIRS))).toEqual({
			rung: "medium",
		});
		expect(
			step(fill(STRUGGLING, DEMOTE_MIN_PAIRS), { rung: "medium" }),
		).toEqual({ settle: "min" });
	});

	it("steps down on the small, steady gain a main-thread clock sees of a compositor-bound engine", () => {
		expect(step(WEBKITGTK_2_52_LAPTOP)).toEqual({ rung: "medium" });
	});

	it("steps down from an upper arm that stalls in every pair, though the lower stalls too", () => {
		expect(step(fill(STALLED, STALLED_MIN_PAIRS))).toEqual({
			rung: "medium",
		});
		expect(
			step(fill(STALLED, STALLED_MIN_PAIRS), { rung: "medium" }),
		).toEqual({ settle: "min" });
	});

	it("climbs from Low only while each upper arm holds 60 fps", () => {
		const climbing = true;
		expect(firstRung({ climbing })).toBe("medium");
		expect(
			step(fill(SMOOTH, SMOOTH_MIN_PAIRS), { rung: "medium", climbing }),
		).toEqual({ rung: "max" });
		expect(
			step(fill(SMOOTH, SMOOTH_MIN_PAIRS), { rung: "max", climbing }),
		).toEqual({ settle: "max" });
		expect(
			step(fill(STALLED, STALLED_MIN_PAIRS), {
				rung: "medium",
				climbing,
			}),
		).toEqual({ settle: "min" });
		expect(
			step(fill(STRUGGLING, DEMOTE_MIN_PAIRS), { rung: "max", climbing }),
		).toEqual({ settle: "medium" });
	});

	it("descends from Full everywhere it does not climb", () => {
		expect(firstRung({ climbing: false })).toBe("max");
	});

	it("does not let one janky pair carry the verdict", () => {
		const samples = [
			...fill(SMOOTH, DEMOTE_MIN_PAIRS - 1),
			[50, REFERENCE_PERIOD_MS] satisfies TrialSample,
		];
		expect(step(samples)).toBeNull();
	});

	it("keeps the upper arm when nothing was ever demonstrated", () => {
		const noisy = fill([17.5, 17.4], MAX_PAIRS);
		expect(step(noisy)).toEqual({ settle: "max" });
	});

	it("cannot step down from an arm the smooth rule would keep, at any pair count", () => {
		expect(DEMOTE_MIN_DROP).toBeGreaterThan(SMOOTH_MAX_DROP);
		const barelySmooth: TrialSample = [
			REFERENCE_PERIOD_MS / (1 - SMOOTH_MAX_DROP),
			REFERENCE_PERIOD_MS,
		];
		for (let pairs = 1; pairs <= MAX_PAIRS; pairs += 1)
			expect(step(fill(barelySmooth, pairs))).not.toEqual({
				rung: "medium",
			});
	});

	it("reaches a verdict before the pair budget runs out", () => {
		expect(STALLED_MIN_PAIRS).toBeLessThan(DEMOTE_MIN_PAIRS);
		expect(DEMOTE_MIN_PAIRS).toBeLessThan(SMOOTH_MIN_PAIRS);
		expect(SMOOTH_MIN_PAIRS).toBeLessThan(MAX_PAIRS);
	});

	it("never treats a 120 Hz panel as a failure", () => {
		const highRefresh: TrialSample = [periodMs(105), periodMs(116)];
		expect(step(fill(highRefresh, MAX_PAIRS))).toEqual({ settle: "max" });
	});
});

describe("pair ordering", () => {
	it("alternates which arm of the rung leads so drift cancels across pairs", () => {
		expect(pairFirstArm({ rung: "max", pairIndex: 0 })).toBe("max");
		expect(pairFirstArm({ rung: "max", pairIndex: 5 })).toBe("medium");
		expect(pairFirstArm({ rung: "medium", pairIndex: 0 })).toBe("medium");
		expect(pairFirstArm({ rung: "medium", pairIndex: 1 })).toBe("min");
		expect(otherArm({ rung: "max", arm: "max" })).toBe("medium");
		expect(otherArm({ rung: "max", arm: "medium" })).toBe("max");
		expect(otherArm({ rung: "medium", arm: "medium" })).toBe("min");
		expect(otherArm({ rung: "medium", arm: "min" })).toBe("medium");
	});
});

describe("backdropBlurCalibrationSchema", () => {
	it("stores shape only, so retuning a constant never wipes a stored trial", () => {
		const samples = fill(SMOOTH, MAX_PAIRS + 1);
		expect(
			backdropBlurCalibrationSchema.parse({
				quality: "max",
				rung: "max",
				engine: "2.52.6",
				samples,
			}).samples,
		).toHaveLength(MAX_PAIRS + 1);
	});

	it("round-trips an unfinished trial on its second rung", () => {
		const value = {
			quality: null,
			rung: "medium",
			engine: "2.54.1",
			samples: [[20, 16.7]],
		};
		expect(backdropBlurCalibrationSchema.parse(value)).toEqual(value);
	});

	it("reads a calibration stored before rungs as the first rung of an unknown engine", () => {
		expect(
			backdropBlurCalibrationSchema.parse({
				quality: "medium",
				samples: [],
			}),
		).toEqual({
			quality: "medium",
			rung: "max",
			engine: null,
			samples: [],
		});
	});
});
