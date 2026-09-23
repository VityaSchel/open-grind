import { addPluginListener } from "@tauri-apps/api/core";

import { backGestureEventHandlers } from "$lib/platform/back-gesture-event.svelte";
import { remeasureScreenChrome } from "$lib/util/screen-chrome.svelte";

const SAFE_AREA_SIDES = ["top", "bottom", "left", "right"] as const;
const IME_RESIZE_FALLBACK_MS = 150;

type SafeAreaSide = (typeof SAFE_AREA_SIDES)[number];

export type NativeInsets = Record<SafeAreaSide, number> & { ime: boolean };

let appliedImeVisible: boolean | undefined;
let deferredInsets: NativeInsets | undefined;
let deferredInsetsTimeout: ReturnType<typeof setTimeout> | undefined;

function readNativeInsets(): NativeInsets | undefined {
	const bridge = window.__AndroidInsets;
	if (!bridge) return undefined;
	return {
		top: bridge.top(),
		bottom: bridge.bottom(),
		left: bridge.left(),
		right: bridge.right(),
		ime: bridge.imeVisible?.() ?? false,
	};
}

function writeSafeAreaInsets(valueOf: (side: SafeAreaSide) => string) {
	const rootStyle = document.documentElement.style;
	let written = false;
	for (const side of SAFE_AREA_SIDES) {
		const property = `--safe-area-${side}`;
		const value = valueOf(side);
		if (rootStyle.getPropertyValue(property) === value) continue;
		rootStyle.setProperty(property, value);
		written = true;
	}
	if (written) remeasureScreenChrome();
}

function applyNativeInsets(insets: NativeInsets) {
	appliedImeVisible = insets.ime;
	writeSafeAreaInsets((side) => `${insets[side]}px`);
}

function cancelDeferredInsets() {
	window.removeEventListener("resize", applyDeferredInsets);
	clearTimeout(deferredInsetsTimeout);
	deferredInsets = undefined;
}

function applyDeferredInsets() {
	const insets = deferredInsets;
	cancelDeferredInsets();
	if (insets) applyNativeInsets(insets);
}

function deferInsetsUntilResize(insets: NativeInsets) {
	if (!deferredInsets) {
		window.addEventListener("resize", applyDeferredInsets);
		deferredInsetsTimeout = setTimeout(
			applyDeferredInsets,
			IME_RESIZE_FALLBACK_MS,
		);
	}
	deferredInsets = insets;
}

export function applyAndroidInsets(dispatch?: NativeInsets) {
	window.__reapplyInsets = applyAndroidInsets;
	const insets = dispatch ?? readNativeInsets();
	if (!insets) {
		writeSafeAreaInsets((side) => `env(safe-area-inset-${side}, 0px)`);
		return;
	}
	const imeFlipped =
		appliedImeVisible !== undefined && insets.ime !== appliedImeVisible;
	if (imeFlipped) {
		deferInsetsUntilResize(insets);
		return;
	}
	cancelDeferredInsets();
	applyNativeInsets(insets);
}

export function softKeyboardVisibility(): boolean | undefined {
	return window.__AndroidInsets?.imeVisible?.();
}

export function softKeyboardHidden({
	settleMs,
}: {
	settleMs: number;
}): Promise<void> {
	return new Promise((resolve) => {
		const done = () => {
			window.removeEventListener("resize", done);
			clearTimeout(timeout);
			resolve();
		};
		const timeout = setTimeout(done, settleMs);
		window.addEventListener("resize", done);
	});
}

function runBackGestureHandlers(): boolean {
	for (const handler of [...backGestureEventHandlers].reverse()) {
		if (handler() !== true) return true;
	}
	return false;
}

export function applyBackGestureHandler() {
	window.__AndroidOnBackGesture = () => !runBackGestureHandlers();
}

export async function registerAndroidBackButtonListener() {
	await addPluginListener(
		"app",
		"back-button",
		({ canGoBack }: { canGoBack: boolean }) => {
			if (runBackGestureHandlers()) return;
			if (window.navigation?.canGoBack ?? canGoBack) history.back();
			else window.__AndroidBack?.moveTaskToBack();
		},
	);
}
