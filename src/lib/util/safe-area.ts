import { createSubscriber } from "svelte/reactivity";

export const SAFE_AREA_SIDES = ["top", "bottom", "left", "right"] as const;

export type SafeAreaSide = (typeof SAFE_AREA_SIDES)[number];

const changeListeners = new Set<() => void>();

export function onSafeAreaChange(listener: () => void): () => void {
	changeListeners.add(listener);
	return () => changeListeners.delete(listener);
}

export function announceSafeAreaChange(): void {
	for (const listener of changeListeners) listener();
}

export function safeAreaInsets(): Record<SafeAreaSide, number> {
	const rootStyle = getComputedStyle(document.documentElement);
	const inset = (side: SafeAreaSide) =>
		parseFloat(rootStyle.getPropertyValue(`--safe-area-${side}`)) || 0;
	return {
		top: inset("top"),
		right: inset("right"),
		bottom: inset("bottom"),
		left: inset("left"),
	};
}

class SafeArea {
	#subscribe = createSubscriber((update) => {
		window.addEventListener("resize", update);
		const stopFollowingInsets = onSafeAreaChange(update);
		return () => {
			window.removeEventListener("resize", update);
			stopFollowingInsets();
		};
	});

	get current(): Record<SafeAreaSide, number> {
		this.#subscribe();
		return safeAreaInsets();
	}
}

export const safeArea = new SafeArea();
