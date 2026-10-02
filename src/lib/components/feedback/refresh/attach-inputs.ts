import { consumesScrollKeys } from "$lib/util/scroll-keys";
import { attachOverscrollPull } from "./overscroll-adapter";
import type { PullModel } from "./pull-model.svelte";
import type { RestingButtonModel } from "./resting-button.svelte";
import {
	AT_BOUNDARY_PX,
	chainAllowsPull,
	type PullPosition,
} from "./scroll-chain";
import { attachTouchPull } from "./touch-adapter";

const KEYS_TOWARD_BOUNDARY: Record<PullPosition, ReadonlySet<string>> = {
	top: new Set(["ArrowUp", "PageUp", "Home"]),
	bottom: new Set(["ArrowDown", "PageDown", "End"]),
};

export type PullInputsOptions = {
	model: PullModel;
	restingButton: RestingButtonModel;
	position: PullPosition;
	boundaryDistance: () => number;
	overscrollPx: () => number;
	busy: () => boolean;
	revealPx: () => number;
	setRevealPx: (px: number) => void;
	setDistance: (px: number) => void;
	shouldReveal: () => boolean;
	shouldConceal: () => boolean;
};

export function attachPullInputs(
	target: HTMLElement,
	{
		model,
		restingButton,
		position,
		boundaryDistance,
		overscrollPx,
		busy,
		revealPx,
		setRevealPx,
		setDistance,
		shouldReveal,
		shouldConceal,
	}: PullInputsOptions,
): () => void {
	const onScroll = () => {
		if (
			!model.gestureActive &&
			!busy() &&
			model.settledFrom === "overscroll" &&
			model.settledOutcome === "canceled" &&
			revealPx() > 0
		) {
			setRevealPx(Math.max(0, overscrollPx()));
		}
		setDistance(boundaryDistance());
		if (shouldReveal()) restingButton.shown = true;
		else if (shouldConceal()) restingButton.shown = false;
	};

	const onWheel = (event: WheelEvent) => {
		// A sideways-dominant wheel is not an attempt to pull; the swipe
		// gesture cancels such wheels, and probing on their vertical crumbs
		// would misread the trackpad as a mouse.
		if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
		const toward = position === "top" ? -event.deltaY : event.deltaY;
		if (toward <= 0 || boundaryDistance() >= AT_BOUNDARY_PX) return;
		restingButton.probePointer();
	};

	const onKeyDown = (event: KeyboardEvent) => {
		if (event.defaultPrevented) return;
		if (!KEYS_TOWARD_BOUNDARY[position].has(event.key)) return;
		if (consumesScrollKeys(event.target)) return;
		if (boundaryDistance() >= AT_BOUNDARY_PX) return;
		if (!chainAllowsPull({ start: event.target, root: target, position }))
			return;
		restingButton.offerWithoutPull();
	};

	// Without this the touch drag freezes: PullModel resists across
	// space * OVERSHOOT minus the baseline, leaving no range to move through.
	const noteTouch = () => restingButton.leaveBoundary();

	target.addEventListener("scroll", onScroll, { passive: true });
	target.addEventListener("wheel", onWheel as EventListener, {
		passive: true,
	});
	target.addEventListener("keydown", onKeyDown);
	target.addEventListener("touchmove", noteTouch, { passive: true });

	const detach = [
		attachTouchPull(model, {
			listenTarget: target,
			scrollRoot: () => target,
			boundaryDistance,
			position,
		}),
		attachOverscrollPull(model, {
			listenTarget: target,
			overscrollPx,
			onWheelOrTouchBand: () => restingButton.leaveBoundary(),
			onBandWithoutWheelOrTouch: () => restingButton.offerWithoutPull(),
		}),
	];

	setDistance(boundaryDistance());

	return () => {
		target.removeEventListener("scroll", onScroll);
		target.removeEventListener("wheel", onWheel as EventListener);
		target.removeEventListener("keydown", onKeyDown);
		target.removeEventListener("touchmove", noteTouch);
		detach.forEach((cleanup) => cleanup());
	};
}
