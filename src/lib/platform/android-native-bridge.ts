import { addPluginListener } from "@tauri-apps/api/core";

import { runBackGestureHandlers } from "$lib/platform/back-gesture-event.svelte";
import {
	announceSafeAreaChange,
	SAFE_AREA_SIDES,
	type SafeAreaSide,
} from "$lib/util/safe-area";
import { remeasureScreenChrome } from "$lib/util/screen-chrome.svelte";
import type { SystemBackAdapter } from "$lib/platform/system-back-gesture";

const IME_RESIZE_FALLBACK_MS = 150;

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
	if (!written) return;
	remeasureScreenChrome();
	announceSafeAreaChange();
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

export function applyBackGestureHandler() {
	window.__AndroidOnBackGesture = () => !runBackGestureHandlers();
}

async function registerAndroidBackButtonListener() {
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

export const androidSystemBack: SystemBackAdapter = {
	install: () => {
		applyBackGestureHandler();
		void registerAndroidBackButtonListener().catch((error) => {
			console.error("Failed to register back button listener", error);
		});
	},
	readProgress: () => window.__AndroidBack?.gestureProgress(),
	expose: ({ start, cancel }) => {
		window.__AndroidOnBackGestureStart = start;
		window.__AndroidOnBackGestureCancel = cancel;
		return () => {
			if (window.__AndroidOnBackGestureStart === start)
				delete window.__AndroidOnBackGestureStart;
			if (window.__AndroidOnBackGestureCancel === cancel)
				delete window.__AndroidOnBackGestureCancel;
		};
	},
};
