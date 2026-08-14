import { attachOverscrollPull } from "./overscroll-adapter";
import type { PullModel } from "./pull-model.svelte";
import { AT_BOUNDARY_PX } from "./scroll-chain";
import { attachTouchPull } from "./touch-adapter";

const BAND_DETECT_PX = 2;

export type PullInputsOptions = {
	model: PullModel;
	position: "top" | "bottom";
	boundaryDistance: () => number;
	overscrollPx: () => number;
	busy: () => boolean;
	mouseProbeMs: number;
	revealPx: () => number;
	setRevealPx: (px: number) => void;
	sawBand: () => boolean;
	setSawBand: (seen: boolean) => void;
	onlyMouseSeen: () => boolean;
	setOnlyMouseSeen: (only: boolean) => void;
	setRestingButtonShown: (shown: boolean) => void;
	setDistance: (px: number) => void;
	shouldReveal: () => boolean;
	shouldConceal: () => boolean;
};

export function attachPullInputs(
	target: HTMLElement,
	{
		model,
		position,
		boundaryDistance,
		overscrollPx,
		busy,
		mouseProbeMs,
		revealPx,
		setRevealPx,
		sawBand,
		setSawBand,
		onlyMouseSeen,
		setOnlyMouseSeen,
		setRestingButtonShown,
		setDistance,
		shouldReveal,
		shouldConceal,
	}: PullInputsOptions,
): () => void {
	const leaveBoundary = () => {
		setSawBand(true);
		setOnlyMouseSeen(false);
		setRestingButtonShown(false);
	};

	let mouseProbe: ReturnType<typeof setTimeout> | undefined;

	const onScroll = () => {
		if (overscrollPx() > BAND_DETECT_PX) leaveBoundary();
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
		if (shouldReveal()) setRestingButtonShown(true);
		else if (shouldConceal()) setRestingButtonShown(false);
	};

	const onWheel = (event: WheelEvent) => {
		if (sawBand() || onlyMouseSeen()) return;
		const toward = position === "top" ? -event.deltaY : event.deltaY;
		if (toward <= 0 || boundaryDistance() >= AT_BOUNDARY_PX) return;
		clearTimeout(mouseProbe);
		mouseProbe = setTimeout(() => {
			if (!sawBand()) setOnlyMouseSeen(true);
		}, mouseProbeMs);
	};

	// Without this the touch drag freezes: PullModel resists across
	// space * OVERSHOOT minus the baseline, leaving no range to move through.
	const noteTouch = () => leaveBoundary();

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
		clearTimeout(mouseProbe);
		detach.forEach((cleanup) => cleanup());
	};
}
