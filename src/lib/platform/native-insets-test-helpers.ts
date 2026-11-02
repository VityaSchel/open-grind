import { vi } from "vitest";

import { resetPlatform } from "$lib/test/platform";
import type { NativeInsets } from "./native-insets";

export const KEYBOARD_HIDDEN: NativeInsets = {
	top: 47.42857142857143,
	bottom: 24,
	left: 0,
	right: 0,
	ime: false,
};

export const KEYBOARD_SHOWN: NativeInsets = {
	...KEYBOARD_HIDDEN,
	bottom: 0,
	ime: true,
};

export const IOS_INSETS: NativeInsets = {
	top: 62,
	bottom: 34,
	left: 0,
	right: 0,
	ime: false,
};

export const FALLBACK_INSETS: NativeInsets = {
	top: 64,
	bottom: 64,
	left: 0,
	right: 0,
	ime: false,
};

export function androidBridge({
	top,
	bottom,
	left,
	right,
	ime,
}: NativeInsets): NonNullable<Window["__AndroidInsets"]> {
	return {
		top: () => top,
		bottom: () => bottom,
		left: () => left,
		right: () => right,
		imeVisible: () => ime,
	};
}

let uninstallNativeInsets: (() => void) | undefined;

export async function loadNativeInsets() {
	vi.resetModules();
	const nativeInsets = await import("./native-insets");
	return {
		...nativeInsets,
		installNativeInsets: (
			...options: Parameters<typeof nativeInsets.installNativeInsets>
		) => {
			uninstallNativeInsets = nativeInsets.installNativeInsets(
				...options,
			);
		},
	};
}

export function resetNativeInsets(): void {
	uninstallNativeInsets?.();
	uninstallNativeInsets = undefined;
	vi.useRealTimers();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	resetPlatform();
	delete window.__AndroidInsets;
	delete window.__iosInsets;
	document.documentElement.removeAttribute("style");
}
