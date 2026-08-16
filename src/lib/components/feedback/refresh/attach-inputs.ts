import { attachOverscrollPull } from "./overscroll-adapter";
import type { PullModel } from "./pull-model.svelte";
import type { RestingButtonModel } from "./resting-button.svelte";
import { AT_BOUNDARY_PX } from "./scroll-chain";
import { attachTouchPull } from "./touch-adapter";

const BAND_DETECT_PX = 2;

export type PullInputsOptions = {
	model: PullModel;
	restingButton: RestingButtonModel;
	position: "top" | "bottom";
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
		if (overscrollPx() > BAND_DETECT_PX) restingButton.leaveBoundary();
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

	// Without this the touch drag freezes: PullModel resists across
	// space * OVERSHOOT minus the baseline, leaving no range to move through.
	const noteTouch = () => restingButton.leaveBoundary();

	target.addEventListener("scroll", onScroll, { passive: true });
	target.addEventListener("wheel", onWheel as EventListener, {
		passive: true,
	});
	target.addEventListener("touchmove", noteTouch, { passive: true });

	const detach = [
		attachTouchPull(model, {
			listenTarget: target,
			scrollRoot: () => target,
			boundaryDistance,
			position,
		}),
		attachOverscrollPull(model, { listenTarget: target, overscrollPx }),
	];

	setDistance(boundaryDistance());

	return () => {
		target.removeEventListener("scroll", onScroll);
		target.removeEventListener("wheel", onWheel as EventListener);
		target.removeEventListener("touchmove", noteTouch);
		detach.forEach((cleanup) => cleanup());
	};
}
