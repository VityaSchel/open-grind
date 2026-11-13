import { sineOut } from "svelte/easing";
import type { FlyParams } from "svelte/transition";

export const FLOATING_CHIP_FLY = {
	y: 48,
	opacity: 0,
	duration: 200,
	easing: sineOut,
} satisfies FlyParams;
