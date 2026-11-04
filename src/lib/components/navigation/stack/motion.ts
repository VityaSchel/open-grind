import { currentPlatform, type SupportedPlatform } from "#lib/platform/os.ts";

export const STACK_Z = { back: "10", dim: "11", front: "12" } as const;

export type ReleaseSpring = { responseMs: number; settledWithin: number };

export type StackMotion = {
	travel: "pane" | number;
	parallaxPercent: number;
	fade: boolean;
	scrim: boolean;
	edge: boolean;
	settleMs: number;
	commitEasing: string;
	cancelEasing: string;
	release?: ReleaseSpring;
};

export type SettleIntent = "commit" | "cancel";

export type SettleTiming = { duration: number; easing: string };

const DECELERATE = "cubic-bezier(0, 0, 0, 1)";
const APPKIT_DEFAULT = "cubic-bezier(0.25, 0.1, 0.25, 1)";
const SPRING_STEP_MS = 1;
const LONGEST_SPRING_MS = 2000;
const SPRING_SAMPLES = 30;
const SPRING_BEZIER_X1 = 0.09;
const SPRING_BEZIER_X2 = 0.12;

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

const IOS_SLIDE: StackMotion = {
	...SLIDE,
	release: { responseMs: 350, settledWithin: 0.003 },
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
}: { platform?: SupportedPlatform } = {}): StackMotion {
	switch (platform) {
		case "android":
			return SLIDE;
		case "ios":
			return IOS_SLIDE;
		case "macos":
			return MACOS;
		case "windows":
			return WINDOWS;
		case "linux":
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

function rounded(value: number): number {
	return Number(value.toFixed(4));
}

function springBezier({ launchSlope }: { launchSlope: number }): string {
	const y1 = rounded(Math.max(launchSlope, 0) * SPRING_BEZIER_X1);
	return `cubic-bezier(${SPRING_BEZIER_X1}, ${y1}, ${SPRING_BEZIER_X2}, 1)`;
}

export function supportsLinearEasing(): boolean {
	return CSS.supports("animation-timing-function", "linear(0, 1)");
}

export function releaseTiming({
	distance,
	velocity,
	spring,
	linearEasing = supportsLinearEasing(),
}: {
	distance: number;
	velocity: number;
	spring: ReleaseSpring;
	linearEasing?: boolean;
}): SettleTiming {
	if (distance === 0) return { duration: 0, easing: "linear" };
	const omega = (2 * Math.PI * 1000) / spring.responseMs;
	const launch = velocity / distance;
	const eased = (ms: number) => {
		const seconds = ms / 1000;
		const left =
			(1 + (omega - launch) * seconds) * Math.exp(-omega * seconds);
		return Math.min(Math.max(1 - left, 0), 1);
	};
	let duration = 0;
	while (
		duration < LONGEST_SPRING_MS &&
		1 - eased(duration) > spring.settledWithin
	)
		duration += SPRING_STEP_MS;

	if (!linearEasing)
		return {
			duration,
			easing: springBezier({ launchSlope: (launch * duration) / 1000 }),
		};
	const stops = Array.from({ length: SPRING_SAMPLES + 1 }, (_, step) =>
		step === SPRING_SAMPLES
			? 1
			: rounded(eased((duration * step) / SPRING_SAMPLES)),
	);
	return { duration, easing: `linear(${stops.join(", ")})` };
}

export function settleTiming({
	from,
	to,
	intent,
	velocity,
	motion,
}: {
	from: number;
	to: number;
	intent: SettleIntent;
	velocity?: number;
	motion: StackMotion;
}): SettleTiming {
	if (velocity !== undefined && motion.release)
		return releaseTiming({
			distance: to - from,
			velocity,
			spring: motion.release,
		});
	return {
		duration: settleDuration({ from, to, motion }),
		easing: intent === "commit" ? motion.commitEasing : motion.cancelEasing,
	};
}
