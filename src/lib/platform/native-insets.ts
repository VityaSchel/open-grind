import { currentPlatform } from "$lib/platform/os";
import {
	announceSafeAreaChange,
	SAFE_AREA_SIDES,
	type SafeAreaSide,
} from "$lib/util/safe-area";
import { remeasureScreenChrome } from "$lib/util/screen-chrome.svelte";

const IME_RESIZE_FALLBACK_MS = 150;

export type NativeInsets = Record<SafeAreaSide, number> & { ime: boolean };

let appliedImeVisible: boolean | undefined;
let deferredInsets: NativeInsets | undefined;
let deferredInsetsTimeout: ReturnType<typeof setTimeout> | undefined;
let focusedFieldRevealFrame: number | undefined;
let revealContainer: { element: Element; observer: ResizeObserver } | undefined;

function readAndroidInsets(): NativeInsets | undefined {
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

function readNativeInsets(): NativeInsets | undefined {
	switch (currentPlatform()) {
		case "android":
			return readAndroidInsets();
		case "ios":
			return window.__iosInsets;
		case "linux":
		case "macos":
		case "windows":
			return undefined;
	}
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

function keyboardCoversFocusedField(): boolean {
	switch (currentPlatform()) {
		case "ios":
			return true;
		case "android":
		case "linux":
		case "macos":
		case "windows":
			return false;
	}
}

function scrollContainerOf(field: Element): Element | undefined {
	for (let node = field.parentElement; node; node = node.parentElement) {
		const { overflowY } = getComputedStyle(node);
		if (overflowY === "auto" || overflowY === "scroll") return node;
	}
	return undefined;
}

function watchRevealContainer(element: Element | undefined) {
	if (revealContainer?.element === element) return;
	revealContainer?.observer.disconnect();
	revealContainer = undefined;
	if (!element) return;
	const observer = new ResizeObserver(revealFocusedFieldUnderKeyboard);
	observer.observe(element);
	revealContainer = { element, observer };
}

function revealFocusedField() {
	focusedFieldRevealFrame = undefined;
	if (!appliedImeVisible) return;
	const field = document.activeElement;
	const editable =
		field instanceof HTMLInputElement ||
		field instanceof HTMLTextAreaElement ||
		(field instanceof HTMLElement && field.isContentEditable);
	if (!editable) return;
	const container = scrollContainerOf(field);
	watchRevealContainer(container);
	const visibleBottom = container
		? Math.min(
				window.innerHeight,
				container.getBoundingClientRect().top +
					container.clientTop +
					container.clientHeight,
			)
		: window.innerHeight;
	if (field.getBoundingClientRect().bottom <= visibleBottom) return;
	field.scrollIntoView({ block: "nearest" });
}

function revealFocusedFieldUnderKeyboard() {
	if (!appliedImeVisible || !keyboardCoversFocusedField()) return;
	if (focusedFieldRevealFrame !== undefined) return;
	focusedFieldRevealFrame = requestAnimationFrame(revealFocusedField);
}

function applyNativeInsets(insets: NativeInsets) {
	if (!insets.ime) watchRevealContainer(undefined);
	appliedImeVisible = insets.ime;
	writeSafeAreaInsets((side) => `${insets[side]}px`);
	revealFocusedFieldUnderKeyboard();
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

export function installNativeInsets({
	fallback,
}: { fallback?: NativeInsets } = {}): () => void {
	const reapplyInsets = (dispatch?: NativeInsets) => {
		const insets = dispatch ?? readNativeInsets() ?? fallback;
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
	};
	window.__reapplyInsets = reapplyInsets;
	window.addEventListener("resize", revealFocusedFieldUnderKeyboard);
	reapplyInsets();
	return () => {
		window.removeEventListener("resize", revealFocusedFieldUnderKeyboard);
		if (focusedFieldRevealFrame !== undefined)
			cancelAnimationFrame(focusedFieldRevealFrame);
		focusedFieldRevealFrame = undefined;
		watchRevealContainer(undefined);
		cancelDeferredInsets();
	};
}

export function softKeyboardVisibility(): boolean | undefined {
	switch (currentPlatform()) {
		case "android":
			return window.__AndroidInsets?.imeVisible?.();
		case "ios":
			return window.__iosInsets?.ime;
		case "linux":
		case "macos":
		case "windows":
			return undefined;
	}
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
