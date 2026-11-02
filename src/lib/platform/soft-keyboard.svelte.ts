import { currentPlatform } from "$lib/platform/os";
import { remeasureScreenChrome } from "$lib/util/screen-chrome.svelte";

const SHRUNK_PAGE_ROOT_ATTRIBUTE = "data-keyboard-shrinks-page";

let keyboardOpen = $state(false);
let pageFollowsKeyboard = $state(false);

export function noteSoftKeyboardOpen(open: boolean): void {
	keyboardOpen = open;
}

export function notePageFollowsSoftKeyboard(follows: boolean): void {
	pageFollowsKeyboard = follows;
}

export function softKeyboardShrinksPage(): boolean {
	switch (currentPlatform()) {
		case "android":
			return keyboardOpen;
		case "ios":
			return keyboardOpen && !pageFollowsKeyboard;
		case "linux":
		case "macos":
		case "windows":
			return false;
	}
}

export function applySoftKeyboardLayout(): void {
	const shrinks = softKeyboardShrinksPage();
	const root = document.documentElement;
	if (root.hasAttribute(SHRUNK_PAGE_ROOT_ATTRIBUTE) === shrinks) return;
	root.toggleAttribute(SHRUNK_PAGE_ROOT_ATTRIBUTE, shrinks);
	remeasureScreenChrome();
}
