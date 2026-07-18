export const MAX_SLINGSHOT_TENSION = 0.5;

/** Android SwipeRefreshLayout's over-drag curve. `progress` is 1 at the arm point. */
export function slingshotTension(progress: number): number {
	const slingshotPercent = Math.min(2, Math.max(0, (progress - 1) * 4));
	return (slingshotPercent / 4 - (slingshotPercent / 4) ** 2) * 2;
}
