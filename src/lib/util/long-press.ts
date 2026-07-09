import type { HTMLAttributes } from "svelte/elements";

const LONG_PRESS_DURATION_MS = 450;
const LONG_PRESS_MOVE_TOLERANCE_PX = 12;

type LongPressHandlers = Pick<
	HTMLAttributes<HTMLElement>,
	| "onpointerdown"
	| "onpointermove"
	| "onpointerup"
	| "onpointercancel"
	| "oncontextmenu"
	| "onclickcapture"
	| "onkeydowncapture"
>;

export function longPressHandlers(onLongPress: () => void): LongPressHandlers {
	let timer: ReturnType<typeof setTimeout> | null = null;
	let originX = 0;
	let originY = 0;
	let fired = false;
	let suppressNextClick = false;

	const cancel = () => {
		if (timer !== null) {
			clearTimeout(timer);
			timer = null;
		}
	};

	return {
		onpointerdown(event) {
			fired = false;
			suppressNextClick = false;
			cancel();
			if (event.pointerType === "mouse") return;
			originX = event.clientX;
			originY = event.clientY;
			timer = setTimeout(() => {
				timer = null;
				fired = true;
				onLongPress();
			}, LONG_PRESS_DURATION_MS);
		},
		onpointermove(event) {
			if (timer === null) return;
			if (
				Math.abs(event.clientX - originX) > LONG_PRESS_MOVE_TOLERANCE_PX ||
				Math.abs(event.clientY - originY) > LONG_PRESS_MOVE_TOLERANCE_PX
			) {
				cancel();
			}
		},
		onpointerup(event) {
			cancel();
			if (fired && event.pointerType !== "mouse") {
				suppressNextClick = true;
			}
		},
		onpointercancel: cancel,
		oncontextmenu(event) {
			event.preventDefault();
			cancel();
			if (!fired) {
				fired = true;
				onLongPress();
			}
		},
		onclickcapture(event) {
			if (!suppressNextClick) return;
			suppressNextClick = false;
			fired = false;
			event.preventDefault();
			event.stopPropagation();
		},
		onkeydowncapture() {
			suppressNextClick = false;
			fired = false;
		},
	};
}
