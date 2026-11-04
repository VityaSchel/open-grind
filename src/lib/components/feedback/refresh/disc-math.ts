export const MAX_SLINGSHOT_TENSION = 0.5;

/** Android SwipeRefreshLayout's over-drag curve. */
export function slingshotTension(armProgress: number): number {
	const slingshotPercent = Math.min(2, Math.max(0, (armProgress - 1) * 4));
	return (slingshotPercent / 4 - (slingshotPercent / 4) ** 2) * 2;
}

const DISC_SIZE = 40;
const DISC_SHADOW = 8;
export const DISC_START = -(DISC_SIZE + DISC_SHADOW);
export const DISC_REST = 10;
const DISC_TRAVEL = DISC_REST - DISC_START;
export const DISC_WINDOW = DISC_REST + DISC_TRAVEL + DISC_SIZE + DISC_SHADOW;

export function discDragTop(armProgress: number): number {
	const drag = Math.min(1, armProgress);
	const tension = slingshotTension(armProgress);
	return DISC_START + DISC_TRAVEL * (drag + tension / MAX_SLINGSHOT_TENSION);
}
