import z from "zod";

import type { BackdropBlurQuality } from "../quality";
import {
	MAX_PAIRS,
	MEDIUM_MIN_GAIN,
	MEDIUM_MIN_PAIRS,
	MEDIUM_MIN_WIN_RATE,
	SMOOTH_MAX_DROP,
	SMOOTH_MIN_PAIRS,
} from "./constants";
import { dropFraction } from "./gesture";

export type AutoQuality = Extract<BackdropBlurQuality, "max" | "medium">;

const trialSampleSchema = z.tuple([z.number(), z.number()]);

export const backdropBlurCalibrationSchema = z.object({
	quality: z.enum(["max", "medium"]).nullable(),
	samples: z.array(trialSampleSchema),
});

export type TrialSample = z.infer<typeof trialSampleSchema>;
export type BackdropBlurCalibration = z.infer<
	typeof backdropBlurCalibrationSchema
>;

export function pairFirstArm(pairIndex: number): AutoQuality {
	return pairIndex % 2 === 0 ? "max" : "medium";
}

export function otherArm(arm: AutoQuality): AutoQuality {
	return arm === "max" ? "medium" : "max";
}

function mean(values: readonly number[]): number {
	if (values.length === 0) return Number.NaN;
	return values.reduce((total, value) => total + value, 0) / values.length;
}

export function decideTrial(
	samples: readonly TrialSample[],
): AutoQuality | null {
	if (samples.length === 0) return null;
	const maxDrops = samples.map(([maxMeanMs]) => dropFraction(maxMeanMs));
	if (
		samples.length >= SMOOTH_MIN_PAIRS &&
		mean(maxDrops) <= SMOOTH_MAX_DROP
	) {
		return "max";
	}
	if (samples.length >= MEDIUM_MIN_PAIRS) {
		const gains = samples.map(
			([maxMeanMs, mediumMeanMs]) =>
				dropFraction(maxMeanMs) - dropFraction(mediumMeanMs),
		);
		const total = gains.reduce((sum, gain) => sum + gain, 0);
		const winRate = gains.filter((gain) => gain > 0).length / gains.length;
		const withoutBest = (total - Math.max(...gains)) / (gains.length - 1);
		if (
			winRate >= MEDIUM_MIN_WIN_RATE &&
			total / gains.length >= MEDIUM_MIN_GAIN &&
			withoutBest >= MEDIUM_MIN_GAIN
		) {
			return "medium";
		}
	}
	if (samples.length >= MAX_PAIRS) return "max";
	return null;
}
