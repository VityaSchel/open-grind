import { REFERENCE_PERIOD_MS, STALL_CLIP_PERIODS } from "./constants";

const CLIP_MS = STALL_CLIP_PERIODS * REFERENCE_PERIOD_MS;

export function clippedMeanMs(intervalsMs: readonly number[]): number {
	if (intervalsMs.length === 0) return Number.NaN;
	let total = 0;
	for (const interval of intervalsMs) total += Math.min(interval, CLIP_MS);
	return total / intervalsMs.length;
}

export function dropFraction(meanMs: number): number {
	if (!Number.isFinite(meanMs) || meanMs <= 0) return Number.NaN;
	return Math.max(0, 1 - REFERENCE_PERIOD_MS / meanMs);
}
