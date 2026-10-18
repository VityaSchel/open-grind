import z from "zod";

import type { BackdropBlurQuality } from "../quality";
import {
	DEMOTE_MIN_DROP,
	DEMOTE_MIN_PAIRS,
	DEMOTE_MIN_WIN_RATE,
	MAX_PAIRS,
	SMOOTH_MAX_DROP,
	SMOOTH_MIN_PAIRS,
	STALLED_DROP,
	STALLED_MIN_PAIRS,
} from "./constants";
import { dropFraction } from "./gesture";

export type AutoQuality = Extract<
	BackdropBlurQuality,
	"max" | "medium" | "min"
>;
export type Rung = Extract<AutoQuality, "max" | "medium">;

export const LOWER_ARM = {
	max: "medium",
	medium: "min",
} as const satisfies Record<Rung, AutoQuality>;

const trialSampleSchema = z.tuple([z.number(), z.number()]);

export const backdropBlurCalibrationSchema = z.object({
	quality: z.enum(["max", "medium", "min"]).nullable(),
	rung: z.enum(["max", "medium"]).default("max"),
	engine: z.string().nullable().default(null),
	samples: z.array(trialSampleSchema),
});

export type TrialSample = z.infer<typeof trialSampleSchema>;
export type BackdropBlurCalibration = z.infer<
	typeof backdropBlurCalibrationSchema
>;

export type TrialStep = { settle: AutoQuality } | { rung: Rung };

function isRung(quality: AutoQuality): quality is Rung {
	return quality in LOWER_ARM;
}

export function firstRung({ climbing }: { climbing: boolean }): Rung {
	return climbing ? "medium" : "max";
}

export function pairFirstArm({
	rung,
	pairIndex,
}: {
	rung: Rung;
	pairIndex: number;
}): AutoQuality {
	return pairIndex % 2 === 0 ? rung : LOWER_ARM[rung];
}

export function otherArm({
	rung,
	arm,
}: {
	rung: Rung;
	arm: AutoQuality;
}): AutoQuality {
	return arm === rung ? LOWER_ARM[rung] : rung;
}

function mean(values: readonly number[]): number {
	if (values.length === 0) return Number.NaN;
	return values.reduce((total, value) => total + value, 0) / values.length;
}

function decideRung(samples: readonly TrialSample[]): "keep" | "demote" | null {
	if (samples.length === 0) return null;
	const upperDrops = samples.map(([upperMs]) => dropFraction(upperMs));
	if (
		samples.length >= STALLED_MIN_PAIRS &&
		upperDrops.every((drop) => drop >= STALLED_DROP)
	) {
		return "demote";
	}
	const upperDrop = mean(upperDrops);
	if (samples.length >= SMOOTH_MIN_PAIRS && upperDrop <= SMOOTH_MAX_DROP)
		return "keep";
	if (samples.length >= DEMOTE_MIN_PAIRS && upperDrop > DEMOTE_MIN_DROP) {
		const gains = samples.map(
			([upperMs, lowerMs]) =>
				dropFraction(upperMs) - dropFraction(lowerMs),
		);
		const winRate = gains.filter((gain) => gain > 0).length / gains.length;
		if (winRate >= DEMOTE_MIN_WIN_RATE && mean(gains) > 0) return "demote";
	}
	if (samples.length >= MAX_PAIRS) return "keep";
	return null;
}

export function nextStep({
	rung,
	samples,
	climbing,
}: {
	rung: Rung;
	samples: readonly TrialSample[];
	climbing: boolean;
}): TrialStep | null {
	const verdict = decideRung(samples);
	if (verdict === null) return null;
	if (verdict === "keep")
		return climbing && rung === "medium"
			? { rung: "max" }
			: { settle: rung };
	const lower = LOWER_ARM[rung];
	return !climbing && isRung(lower) ? { rung: lower } : { settle: lower };
}
