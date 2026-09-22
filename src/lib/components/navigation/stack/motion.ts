const BACK_PARALLAX_PERCENT = 33;
const DIM_OPACITY = 0.1;
export const SETTLE_MS = 540;
export const COMMIT_EASING = "cubic-bezier(0.32, 0.72, 0, 1)";
export const CANCEL_EASING = "cubic-bezier(1, 0, 0.68, 0.28)";
export const STACK_Z = { back: "10", dim: "11", front: "12" } as const;

type PaneFrame = { front: string; back: string; dim: number };

export function paneFrame({
	progress,
	parallax,
}: {
	progress: number;
	parallax: boolean;
}): PaneFrame {
	const behind = parallax ? BACK_PARALLAX_PERCENT * (progress - 1) : 0;
	return {
		front: `translate3d(${(progress * 100).toFixed(3)}%,0,0)`,
		back: `translate3d(${behind.toFixed(3)}%,0,0)`,
		dim: DIM_OPACITY * (1 - progress),
	};
}

export function settleDuration(from: number, to: number): number {
	return SETTLE_MS * Math.abs(to - from);
}
