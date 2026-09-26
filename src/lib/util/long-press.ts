import type { HTMLAttributes } from "svelte/elements";

import { playHaptic } from "$lib/haptics";

const LONG_PRESS_DURATION_MS = 450;
const LONG_PRESS_MOVE_TOLERANCE_PX = 12;
// A layout shift can land the contextmenu or the click on another element.
const NATIVE_CONTEXTMENU_DELAY_MS = 500;
const CLICK_SUPPRESS_MS = 700;

let lastFiredAt = 0;
let heldTouchUntil = 0;
let suppressClickUntil = 0;
let documentListenersAttached = false;

function isTouchLike(pointerType: string | undefined): boolean {
	return pointerType === "touch" || pointerType === "pen";
}

function fireOnce({
	onLongPress,
	pointerType,
}: {
	onLongPress: () => void;
	pointerType: string | undefined;
}): void {
	const now = Date.now();
	if (now - lastFiredAt < NATIVE_CONTEXTMENU_DELAY_MS) return;
	lastFiredAt = now;
	if (isTouchLike(pointerType)) playHaptic("longPress");
	onLongPress();
}

function onGlobalClickCapture(event: MouseEvent): void {
	if (suppressClickUntil === 0) return;
	if (Date.now() > suppressClickUntil) {
		suppressClickUntil = 0;
		return;
	}
	suppressClickUntil = 0;
	event.preventDefault();
	event.stopPropagation();
}

function onGlobalPointerDownCapture(): void {
	suppressClickUntil = 0;
}

function suppressNextClick(): void {
	suppressClickUntil = Date.now() + CLICK_SUPPRESS_MS;
	if (documentListenersAttached || typeof document === "undefined") return;
	documentListenersAttached = true;
	document.addEventListener("click", onGlobalClickCapture, { capture: true });
	document.addEventListener("pointerdown", onGlobalPointerDownCapture, {
		capture: true,
	});
}

// Chromium follows a held touch with its own contextmenu, and WebKitGTK sends
// one typed as a mouse when the finger lifts: both belong to the fired hold.
function holdTouch(): void {
	heldTouchUntil = Number.POSITIVE_INFINITY;
	if (typeof window === "undefined") return;
	const release = () => {
		heldTouchUntil = Date.now() + NATIVE_CONTEXTMENU_DELAY_MS;
		window.removeEventListener("pointerup", release, true);
		window.removeEventListener("pointercancel", release, true);
	};
	window.addEventListener("pointerup", release, true);
	window.addEventListener("pointercancel", release, true);
}

type LongPressHandlers = Pick<
	HTMLAttributes<HTMLElement>,
	| "onpointerdown"
	| "onpointermove"
	| "onpointerup"
	| "onpointercancel"
	| "oncontextmenu"
>;

export function longPressHandlers(onLongPress: () => void): LongPressHandlers {
	let timer: ReturnType<typeof setTimeout> | null = null;
	let originX = 0;
	let originY = 0;
	let pressing = false;
	let pressConsumed = false;

	const cancel = () => {
		if (timer !== null) {
			clearTimeout(timer);
			timer = null;
		}
	};

	return {
		onpointerdown(event) {
			pressConsumed = false;
			cancel();
			if (event.pointerType === "mouse") return;
			pressing = true;
			originX = event.clientX;
			originY = event.clientY;
			const { pointerType } = event;
			timer = setTimeout(() => {
				timer = null;
				pressConsumed = true;
				holdTouch();
				fireOnce({ onLongPress, pointerType });
			}, LONG_PRESS_DURATION_MS);
		},
		onpointermove(event) {
			if (timer === null) return;
			if (
				Math.abs(event.clientX - originX) >
					LONG_PRESS_MOVE_TOLERANCE_PX ||
				Math.abs(event.clientY - originY) > LONG_PRESS_MOVE_TOLERANCE_PX
			) {
				cancel();
			}
		},
		onpointerup(event) {
			pressing = false;
			cancel();
			if (pressConsumed && event.pointerType !== "mouse") {
				suppressNextClick();
			}
		},
		onpointercancel() {
			pressing = false;
			cancel();
		},
		oncontextmenu(event) {
			event.preventDefault();
			cancel();
			if (Date.now() < heldTouchUntil) return;
			if (pressing && pressConsumed) return;
			pressConsumed = true;
			const { pointerType } = event as Partial<PointerEvent>;
			if (pointerType === "mouse" || pointerType === "") {
				onLongPress();
				return;
			}
			if (isTouchLike(pointerType)) holdTouch();
			fireOnce({ onLongPress, pointerType });
		},
	};
}
