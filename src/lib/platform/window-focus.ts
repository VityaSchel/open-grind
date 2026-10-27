import { getCurrentWindow } from "@tauri-apps/api/window";

import { currentPlatform, isDesktopPlatform } from "./os";

const returnListeners = new Set<() => void>();
let desktopFocused = true;
let wasFocused = true;
let following = false;

function noteFocusChange(): void {
	const focused = windowFocused();
	if (focused && !wasFocused)
		for (const listener of returnListeners) listener();
	wasFocused = focused;
}

function followDesktopFocus(): void {
	const window = getCurrentWindow();
	window
		.isFocused()
		.then((focused) => {
			desktopFocused = focused;
			noteFocusChange();
		})
		.catch((error: unknown) => {
			console.error("Failed to read the window focus", error);
		});
	window
		.onFocusChanged(({ payload: focused }) => {
			desktopFocused = focused;
			noteFocusChange();
		})
		.catch((error: unknown) => {
			console.error("Failed to follow the window focus", error);
		});
}

function followFocus(): void {
	if (following) return;
	following = true;
	wasFocused = windowFocused();
	document.addEventListener("visibilitychange", noteFocusChange);
	window.addEventListener("focus", noteFocusChange);
	window.addEventListener("blur", noteFocusChange);
	if (isDesktopPlatform()) followDesktopFocus();
}

export function windowFocused(): boolean {
	followFocus();
	const visible = document.visibilityState === "visible";
	switch (currentPlatform()) {
		case "linux":
		case "macos":
		case "windows":
			return visible && desktopFocused;
		case "android":
		case "ios":
			// Android's WebView keeps document.hasFocus() false while the app is in front
			return visible;
	}
}

export function onWindowReturn(listener: () => void): () => void {
	followFocus();
	returnListeners.add(listener);
	return () => returnListeners.delete(listener);
}
