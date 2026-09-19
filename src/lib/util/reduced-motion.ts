import { prefersReducedMotion } from "svelte/motion";
import {
	fly as flyTransition,
	scale as scaleTransition,
	slide as slideTransition,
	type TransitionConfig,
} from "svelte/transition";

export function fadeWhenReducedMotion<
	Target extends Element,
	Rest extends unknown[],
>(
	transition: (node: Target, ...rest: Rest) => TransitionConfig,
): (node: Target, ...rest: Rest) => TransitionConfig {
	return (node, ...rest) => {
		const config = transition(node, ...rest);
		if (!prefersReducedMotion.current) return config;
		const opacity = Number(getComputedStyle(node).opacity);
		return {
			delay: config.delay,
			duration: config.duration,
			easing: config.easing,
			css: (t) => `opacity: ${t * opacity}`,
		};
	};
}

export function instantWhenReducedMotion<
	Target extends Element,
	Rest extends unknown[],
>(
	transition: (node: Target, ...rest: Rest) => TransitionConfig,
): (node: Target, ...rest: Rest) => TransitionConfig {
	return (node, ...rest) =>
		prefersReducedMotion.current
			? { duration: 0 }
			: transition(node, ...rest);
}

export const fly = fadeWhenReducedMotion(flyTransition);
export const scale = fadeWhenReducedMotion(scaleTransition);
export const slide = instantWhenReducedMotion(slideTransition);

export function preferredScrollBehavior(): ScrollBehavior {
	return prefersReducedMotion.current ? "instant" : "smooth";
}
