import { currentPlatform } from "#lib/platform/os.ts";
import type { PullSource } from "./pull-model.svelte";

export type PullStyle = { source: "band" | "touch"; armPx: number };
export type IndicatorFace = "disc" | "ticks" | "hint" | "button";

const IOS_ARM_PX = 58;
const DISC_ARM_PX = 18;

export function pullStyleHere(): PullStyle {
	switch (currentPlatform()) {
		case "ios":
			return { source: "band", armPx: IOS_ARM_PX };
		case "android":
		case "linux":
		case "macos":
		case "windows":
			return { source: "touch", armPx: DISC_ARM_PX };
	}
}

export function gestureFace(source: PullSource | null): IndicatorFace {
	switch (source) {
		case "touch":
			return "disc";
		case "band":
			return "ticks";
		case "overscroll":
		case "click":
		case null:
			return "hint";
	}
}
