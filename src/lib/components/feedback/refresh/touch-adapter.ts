import type { PullModel } from "./pull-model.svelte";
import {
	AT_BOUNDARY_PX,
	chainAllowsPull,
	type PullPosition,
} from "./scroll-chain";

const SLOP_PX = 8;

export interface TouchPullOptions {
	listenTarget: EventTarget;
	scrollRoot: () => Element | null;
	boundaryDistance: () => number;
	position: PullPosition;
}

/**
 * Touch pull-to-refresh. We don't always get the gesture: if the browser already
 * decided it is a scroll, the touchmoves come in non-cancelable.
 */
export function attachTouchPull(
	model: PullModel,
	{ listenTarget, scrollRoot, boundaryDistance, position }: TouchPullOptions,
): () => void {
	let touchId: number | null = null;
	let startX = 0;
	let startY = 0;
	let startTarget: EventTarget | null = null;
	let engaged = false;
	let dead = false;

	const pullDelta = (touch: Touch) => {
		const dy = touch.clientY - startY;
		return position === "top" ? dy : -dy;
	};

	const findTouch = (event: TouchEvent) =>
		[...event.changedTouches].find((t) => t.identifier === touchId) ?? null;

	const anchorPullOrigin = (touch: Touch) => {
		startX = touch.clientX;
		startY = touch.clientY;
	};

	const reset = () => {
		touchId = null;
		startTarget = null;
		engaged = false;
		dead = false;
		removeGestureListeners();
	};

	const ownEveryFinger = (event: TouchEvent) => {
		if (engaged && event.cancelable) event.preventDefault();
	};

	const onTouchMove = (event: TouchEvent) => {
		ownEveryFinger(event);
		const touch = findTouch(event);
		if (!touch) return;

		if (!engaged && !dead) {
			const nativeScrollOwnsGesture = boundaryDistance() >= AT_BOUNDARY_PX;
			if (nativeScrollOwnsGesture) {
				anchorPullOrigin(touch);
				return;
			}
			const pull = pullDelta(touch);
			const cross = Math.abs(touch.clientX - startX);
			if (pull <= -SLOP_PX || cross > Math.abs(pull)) {
				dead = true;
				return;
			}
			if (pull < SLOP_PX) return;
			const root = scrollRoot();
			if (
				!root ||
				!chainAllowsPull(startTarget, root, position) ||
				!model.beginPull("touch")
			) {
				dead = true;
				return;
			}
			engaged = true;
		}

		if (engaged) {
			if (event.cancelable) event.preventDefault();
			model.updatePull(Math.max(0, pullDelta(touch) - SLOP_PX));
		}
	};

	const onScroll = () => {
		const nativeScrollWon = engaged && boundaryDistance() >= AT_BOUNDARY_PX;
		if (!nativeScrollWon) return;
		model.cancel();
		engaged = false;
		dead = true;
	};

	const onTouchEnd = (event: TouchEvent) => {
		if (!findTouch(event)) return;
		if (engaged) model.release();
		reset();
	};

	const onTouchCancel = (event: TouchEvent) => {
		if (!findTouch(event)) return;
		if (engaged) model.cancel();
		reset();
	};

	const addGestureListeners = () => {
		listenTarget.addEventListener("touchmove", onTouchMove as EventListener, {
			passive: false,
		});
		listenTarget.addEventListener("touchend", onTouchEnd as EventListener);
		listenTarget.addEventListener(
			"touchcancel",
			onTouchCancel as EventListener,
		);
		listenTarget.addEventListener("scroll", onScroll, { passive: true });
	};

	const removeGestureListeners = () => {
		listenTarget.removeEventListener("touchmove", onTouchMove as EventListener);
		listenTarget.removeEventListener("touchend", onTouchEnd as EventListener);
		listenTarget.removeEventListener(
			"touchcancel",
			onTouchCancel as EventListener,
		);
		listenTarget.removeEventListener("scroll", onScroll);
	};

	const onTouchStart = (event: TouchEvent) => {
		if (event.touches.length !== 1) return;
		// Left over from a gesture whose touchend fired on a node that got removed,
		// so it never reached us.
		if (touchId !== null) {
			if (engaged) model.cancel();
			reset();
		}
		const touch = event.changedTouches[0];
		touchId = touch.identifier;
		anchorPullOrigin(touch);
		startTarget = event.target;
		engaged = false;
		dead = false;
		addGestureListeners();
	};

	listenTarget.addEventListener("touchstart", onTouchStart as EventListener, {
		passive: true,
	});
	return () => {
		listenTarget.removeEventListener(
			"touchstart",
			onTouchStart as EventListener,
		);
		removeGestureListeners();
		if (engaged) model.cancel();
	};
}
