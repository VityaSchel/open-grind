import type { HTMLAttributes } from "svelte/elements";

const LONG_PRESS_DURATION_MS = 450;
const LONG_PRESS_MOVE_TOLERANCE_PX = 12;
// A layout shift can land the contextmenu or the click on another element.
const NATIVE_CONTEXTMENU_DELAY_MS = 500;
const CLICK_SUPPRESS_MS = 700;

let lastFiredAt = 0;
let suppressClickUntil = 0;
let clickSuppressorAttached = false;

function fireOnce(onLongPress: () => void): void {
	const now = Date.now();
	if (now - lastFiredAt < NATIVE_CONTEXTMENU_DELAY_MS) return;
	lastFiredAt = now;
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

function suppressNextClick(): void {
	suppressClickUntil = Date.now() + CLICK_SUPPRESS_MS;
	if (clickSuppressorAttached || typeof document === "undefined") return;
	clickSuppressorAttached = true;
	document.addEventListener("click", onGlobalClickCapture, { capture: true });
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
			originX = event.clientX;
			originY = event.clientY;
			timer = setTimeout(() => {
				timer = null;
				pressConsumed = true;
				fireOnce(onLongPress);
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
			cancel();
			if (pressConsumed && event.pointerType !== "mouse") {
				suppressNextClick();
			}
		},
		onpointercancel: cancel,
		oncontextmenu(event) {
			event.preventDefault();
			cancel();
			if (!pressConsumed) {
				pressConsumed = true;
				fireOnce(onLongPress);
			}
		},
	};
}
