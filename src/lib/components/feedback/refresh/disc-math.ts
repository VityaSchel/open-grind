export const MAX_SLINGSHOT_TENSION = 0.5;

/** Android SwipeRefreshLayout's over-drag curve. */
export function slingshotTension(armProgress: number): number {
	const slingshotPercent = Math.min(2, Math.max(0, (armProgress - 1) * 4));
	return (slingshotPercent / 4 - (slingshotPercent / 4) ** 2) * 2;
}
