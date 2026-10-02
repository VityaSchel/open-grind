import { isMacosPlatform } from "$lib/platform/os";
import {
	scrollGesture,
	type ScrollGestureState,
} from "$lib/platform/scroll-gesture";
import {
	consumesScrollKeys,
	keyScrollsToward,
	scrollKeysToward,
} from "$lib/util/scroll-keys";
import { attachOverscrollPull } from "./overscroll-adapter";
import type { PullModel } from "./pull-model.svelte";
import type { RestingButtonModel } from "./resting-button.svelte";
import {
	AT_BOUNDARY_PX,
	chainAllowsPull,
	type PullPosition,
} from "./scroll-chain";
import { attachTouchPull } from "./touch-adapter";

const TRACKPAD_TAIL_MS = 100;

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
	fingerPhase?: ScrollGestureState | null;
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
		fingerPhase = isMacosPlatform() ? scrollGesture : null,
	}: PullInputsOptions,
): () => void {
	let trackpadEndedAt = -Infinity;
	const trackpadScrolling = () =>
		fingerPhase !== null &&
		(fingerPhase.phase !== "idle" ||
			performance.now() - trackpadEndedAt < TRACKPAD_TAIL_MS);

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
		// A wheel that is not vertical-dominant is no attempt to pull; the swipe
		// gesture cancels such wheels, and probing on their vertical crumbs
		// would misread the trackpad as a mouse.
		if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
		if (trackpadScrolling()) return;
		const toward = position === "top" ? -event.deltaY : event.deltaY;
		if (toward <= 0 || boundaryDistance() >= AT_BOUNDARY_PX) return;
		restingButton.probePointer();
	};

	const onKeyDown = (event: KeyboardEvent) => {
		if (event.defaultPrevented) return;
		if (!scrollKeysToward[position].has(event.key)) return;
		if (consumesScrollKeys(event.target)) return;
		if (boundaryDistance() >= AT_BOUNDARY_PX) return;
		if (!chainAllowsPull({ start: event.target, root: target, position }))
			return;
		restingButton.offerWithoutPull();
	};

	let scrollKeyAt: number | null = null;
	const noteScrollKey = (event: KeyboardEvent) => {
		if (!keyScrollsToward({ event, edge: position })) return;
		if (consumesScrollKeys(event.target)) return;
		scrollKeyAt = performance.now();
	};
	const onWindowCapture = { capture: true, passive: true };

	// Without this the touch drag freezes: PullModel resists across
	// space * OVERSHOOT minus the baseline, leaving no range to move through.
	const noteTouch = () => restingButton.leaveBoundary();

	target.addEventListener("scroll", onScroll, { passive: true });
	target.addEventListener("wheel", onWheel as EventListener, {
		passive: true,
	});
	target.addEventListener("keydown", onKeyDown);
	target.addEventListener("touchmove", noteTouch, { passive: true });
	window.addEventListener("keydown", noteScrollKey, onWindowCapture);
	window.addEventListener("keyup", noteScrollKey, onWindowCapture);

	const stopWatchingPhase = fingerPhase?.onPhaseChange((phase) => {
		if (phase === "idle") trackpadEndedAt = performance.now();
		else restingButton.cancelProbe();
	});

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
			scrollKeyAt: () => (trackpadScrolling() ? null : scrollKeyAt),
			onPullBand: () => restingButton.leaveBoundary(),
			onKeyBand: () => restingButton.offerWithoutPull(),
		}),
	];

	setDistance(boundaryDistance());

	return () => {
		target.removeEventListener("scroll", onScroll);
		target.removeEventListener("wheel", onWheel as EventListener);
		target.removeEventListener("keydown", onKeyDown);
		target.removeEventListener("touchmove", noteTouch);
		window.removeEventListener("keydown", noteScrollKey, onWindowCapture);
		window.removeEventListener("keyup", noteScrollKey, onWindowCapture);
		stopWatchingPhase?.();
		detach.forEach((cleanup) => cleanup());
	};
}
