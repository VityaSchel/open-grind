import { backGestureEventHandlers } from "$lib/platform/back-gesture-event.svelte";

function readEnvInset(prop: string): number {
	const el = document.createElement("div");
	el.style.cssText = `position:fixed;height:env(${prop},0px);visibility:hidden;pointer-events:none`;
	document.documentElement.appendChild(el);
	const value = parseFloat(getComputedStyle(el).height) || 0;
	document.documentElement.removeChild(el);
	return value;
}

export function applyAndroidInsets() {
	for (const side of ["top", "bottom", "left", "right"] as const) {
		const cssInset = readEnvInset(`safe-area-inset-${side}`);
		const nativeInset = window.__AndroidInsets?.[side]();
		let value: string;
		if (cssInset !== 0) value = `env(safe-area-inset-${side}, 0px)`;
		else if (nativeInset !== undefined) value = `${nativeInset}px`;
		else value = "0px";
		document.documentElement.style.setProperty(`--safe-area-${side}`, value);
	}

	window.__reapplyInsets = applyAndroidInsets;
}

export function applyBackGestureHandler() {
	window.__AndroidOnBackGesture = () => {
		const handlers = [...backGestureEventHandlers];
		for (let index = handlers.length - 1; index >= 0; index--) {
			if (handlers[index]() !== true) return false;
		}
		return true;
	};
}
