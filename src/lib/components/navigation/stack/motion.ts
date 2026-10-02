import type { Platform } from "@tauri-apps/plugin-os";

import { currentPlatform } from "$lib/platform/os";

export const STACK_Z = { back: "10", dim: "11", front: "12" } as const;

export type StackMotion = {
	travel: "pane" | number;
	parallaxPercent: number;
	fade: boolean;
	scrim: boolean;
	edge: boolean;
	settleMs: number;
	commitEasing: string;
	cancelEasing: string;
};

export type SettleIntent = "commit" | "cancel";

const DECELERATE = "cubic-bezier(0, 0, 0, 1)";
const APPKIT_DEFAULT = "cubic-bezier(0.25, 0.1, 0.25, 1)";

const SLIDE: StackMotion = {
	travel: "pane",
	parallaxPercent: 33,
	fade: false,
	scrim: true,
	edge: true,
	settleMs: 540,
	commitEasing: "cubic-bezier(0.32, 0.72, 0, 1)",
	cancelEasing: "cubic-bezier(1, 0, 0.68, 0.28)",
};

const FADE_OVER: StackMotion = {
	travel: 0,
	parallaxPercent: 0,
	fade: true,
	scrim: false,
	edge: false,
	settleMs: 250,
	commitEasing: DECELERATE,
	cancelEasing: DECELERATE,
};

const MACOS: StackMotion = {
	...FADE_OVER,
	commitEasing: APPKIT_DEFAULT,
	cancelEasing: APPKIT_DEFAULT,
};

const WINDOWS: StackMotion = { ...FADE_OVER, travel: 40, settleMs: 300 };

export function stackMotion({
	platform = currentPlatform(),
	coarsePointer = platform === "web" &&
		matchMedia("(pointer: coarse)").matches,
}: { platform?: Platform | "web"; coarsePointer?: boolean } = {}): StackMotion {
	switch (platform) {
		case "android":
		case "ios":
			return SLIDE;
		case "macos":
			return MACOS;
		case "windows":
			return WINDOWS;
		case "web":
			return coarsePointer ? SLIDE : MACOS;
		default:
			return FADE_OVER;
	}
}

type PaneStyle = { transform: string; opacity?: string };
type PaneFrame = { front: PaneStyle; back: PaneStyle; dim: number };

export function paneFrame({
	progress,
	parallax,
	motion,
}: {
	progress: number;
	parallax: boolean;
	motion: StackMotion;
}): PaneFrame {
	const behind = parallax ? motion.parallaxPercent * (progress - 1) : 0;
	const travelled =
		motion.travel === "pane"
			? `${(progress * 100).toFixed(3)}%`
			: `${(progress * motion.travel).toFixed(3)}px`;
	const front = `translate3d(${travelled},0,0)`;
	const back = `translate3d(${behind.toFixed(3)}%,0,0)`;
	return {
		front: motion.fade
			? { transform: front, opacity: (1 - progress).toFixed(3) }
			: { transform: front },
		back: motion.fade
			? { transform: back, opacity: "1" }
			: { transform: back },
		dim: motion.scrim ? 1 - progress : 0,
	};
}

export function settleDuration({
	from,
	to,
	motion,
}: {
	from: number;
	to: number;
	motion: StackMotion;
}): number {
	return motion.settleMs * Math.abs(to - from);
}
