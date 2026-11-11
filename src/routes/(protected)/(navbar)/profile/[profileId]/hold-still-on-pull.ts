import type { Attachment } from "svelte/attachments";

import { chainRestsAt } from "#lib/components/feedback/refresh/scroll-chain.ts";
import { currentPlatform } from "#lib/platform/os.ts";

const DIRECTION_SLOP_PX = 3;
const CHROMIUM_TOUCH_SLOP_PX = 8;
const UIKIT_TAP_SLOP_PX = 10;
const ANDROID_LONG_PRESS_MS = 400;
const UIKIT_LONG_PRESS_MS = 500;
export const NATIVE_CLICK_WAIT_MS = 1000;

type Hold = { tapSlopPx: number; longPressMs: number };
type Landing = { id: number; x: number; y: number };
type Tap = Landing & { target: Element; landedAt: number };

function holdHere(): Hold | null {
	switch (currentPlatform()) {
		case "android":
			return {
				tapSlopPx: CHROMIUM_TOUCH_SLOP_PX,
				longPressMs: ANDROID_LONG_PRESS_MS,
			};
		case "ios":
			return {
				tapSlopPx: UIKIT_TAP_SLOP_PX,
				longPressMs: UIKIT_LONG_PRESS_MS,
			};
		case "linux":
		case "macos":
		case "windows":
			return null;
	}
}

const touchOf = ({ event, id }: { event: TouchEvent; id: number }) =>
	[...event.changedTouches].find(({ identifier }) => identifier === id);

function replayTap({
	target,
	touch,
	view,
}: {
	target: Element;
	touch: Touch;
	view: Window | null;
}) {
	target.dispatchEvent(
		new MouseEvent("click", {
			bubbles: true,
			cancelable: true,
			composed: true,
			view,
			detail: 1,
			clientX: touch.clientX,
			clientY: touch.clientY,
			screenX: touch.screenX,
			screenY: touch.screenY,
		}),
	);
}

function swallowNativeClick(): () => void {
	const guard = new AbortController();
	const stop = () => guard.abort();
	const timeout = setTimeout(stop, NATIVE_CLICK_WAIT_MS);
	guard.signal.addEventListener("abort", () => clearTimeout(timeout));
	const options = { capture: true, signal: guard.signal };
	window.addEventListener(
		"click",
		(event) => {
			if (event.detail === 0) return;
			event.preventDefault();
			event.stopImmediatePropagation();
			stop();
		},
		options,
	);
	window.addEventListener("pointerdown", stop, options);
	return stop;
}

function holdStillOnPull({
	area,
	tapSlopPx,
	longPressMs,
}: Hold & { area: HTMLElement }): () => void {
	let landing: Landing | null = null;
	let holding = false;
	let tap: Tap | null = null;
	let stopSwallowing = () => {};

	const decide = ({ event, from }: { event: TouchEvent; from: Landing }) => {
		const touch = touchOf({ event, id: from.id });
		if (!touch) return;
		const dx = touch.clientX - from.x;
		const dy = touch.clientY - from.y;
		if (Math.max(Math.abs(dx), Math.abs(dy)) < DIRECTION_SLOP_PX) return;
		landing = null;
		holding =
			dy > Math.abs(dx) &&
			event.target instanceof Element &&
			chainRestsAt({ start: event.target, position: "top" });
	};

	const leftTheTap = ({ event, from }: { event: TouchEvent; from: Tap }) => {
		const touch = touchOf({ event, id: from.id });
		return (
			!!touch &&
			Math.hypot(touch.clientX - from.x, touch.clientY - from.y) >
				tapSlopPx
		);
	};

	const onTouchStart = (event: TouchEvent) => {
		const landed = new Set(
			[...event.changedTouches].map(({ identifier }) => identifier),
		);
		const joinsAGestureOnArea = [...event.touches].some(
			({ identifier, target }) =>
				!landed.has(identifier) &&
				target instanceof Node &&
				area.contains(target),
		);
		tap = null;
		if (joinsAGestureOnArea) return;
		const touch = event.changedTouches[0];
		landing =
			event.touches.length === 1 && touch
				? { id: touch.identifier, x: touch.clientX, y: touch.clientY }
				: null;
		if (landing && event.target instanceof Element)
			tap = {
				...landing,
				target: event.target,
				landedAt: event.timeStamp,
			};
		holding = false;
	};

	const onTouchMove = (event: TouchEvent) => {
		if (landing) decide({ event, from: landing });
		if (tap && leftTheTap({ event, from: tap })) tap = null;
		if (holding && event.cancelable) event.preventDefault();
	};

	const onPointerUp = (event: PointerEvent) => {
		if (holding && !tap && event.pointerType === "touch")
			event.stopPropagation();
	};

	const onTouchEnd = (event: TouchEvent) => {
		const heldTap = holding ? tap : null;
		tap = null;
		if (!heldTap || event.touches.length > 0) return;
		const touch = touchOf({ event, id: heldTap.id });
		if (
			!touch ||
			!heldTap.target.isConnected ||
			event.timeStamp - heldTap.landedAt >= longPressMs
		)
			return;
		if (event.cancelable) event.preventDefault();
		replayTap({ target: heldTap.target, touch, view: event.view });
		stopSwallowing();
		stopSwallowing = swallowNativeClick();
	};

	const listening = new AbortController();
	area.addEventListener("touchstart", onTouchStart, {
		passive: true,
		signal: listening.signal,
	});
	area.addEventListener("touchmove", onTouchMove, {
		passive: false,
		signal: listening.signal,
	});
	area.addEventListener("pointerup", onPointerUp, {
		capture: true,
		signal: listening.signal,
	});
	area.addEventListener("touchend", onTouchEnd, {
		passive: false,
		signal: listening.signal,
	});
	return () => {
		listening.abort();
		stopSwallowing();
	};
}

export function holdsStillHere(): boolean {
	return holdHere() !== null;
}

export const holdsStillOnPull: Attachment<HTMLElement> = (area) => {
	const hold = holdHere();
	if (hold) return holdStillOnPull({ area, ...hold });
};
