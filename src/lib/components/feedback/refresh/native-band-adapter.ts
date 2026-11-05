import type { PullModel } from "./pull-model.svelte";
import {
	AT_BOUNDARY_PX,
	chainAllowsPull,
	type PullPosition,
} from "./scroll-chain";

const PAST_EDGE_PX = 0.5;
const FINGER_PHASE = { capture: true, passive: true } as const;

export interface NativeBandPullOptions {
	scroller: HTMLElement;
	position: PullPosition;
	overscrollPx: () => number;
	honorNoPull?: boolean;
	onPullBand?: () => void;
}

export function attachNativeBandPull(
	model: PullModel,
	{
		scroller,
		position,
		overscrollPx,
		honorNoPull,
		onPullBand,
	}: NativeBandPullOptions,
): () => void {
	let ours = false;
	const fingersOnList = new Set<number>();
	let seenInBounds = false;
	let pulling = false;
	let frame: number | null = null;

	const stopFrames = () => {
		if (frame !== null) cancelAnimationFrame(frame);
		frame = null;
	};

	const reset = () => {
		ours = false;
		fingersOnList.clear();
		seenInBounds = false;
		pulling = false;
		stopFrames();
	};

	const sample = () => {
		if (!ours) return;
		const over = overscrollPx();
		if (!pulling) {
			if (over <= PAST_EDGE_PX) {
				seenInBounds = true;
				return;
			}
			if (!seenInBounds) return;
			if (!model.beginPull("band")) {
				seenInBounds = false;
				return;
			}
			pulling = true;
			onPullBand?.();
		}
		if (over < -AT_BOUNDARY_PX) {
			model.cancel();
			pulling = false;
			return;
		}
		model.updatePull(over, { preResisted: true });
	};

	const followFrames = () => {
		const step = () => {
			sample();
			frame = ours ? requestAnimationFrame(step) : null;
		};
		frame ??= requestAnimationFrame(step);
	};

	const trackFingers = (touches: TouchList) => {
		for (const touch of touches) fingersOnList.add(touch.identifier);
	};

	const anyFingerOnList = (touches: TouchList) =>
		[...touches].some((touch) => fingersOnList.has(touch.identifier));

	const onTouchStart = (event: TouchEvent) => {
		const start = event.target;
		const landedOnList = start instanceof Node && scroller.contains(start);
		if (event.touches.length > 1) {
			if (ours && landedOnList) trackFingers(event.changedTouches);
			return;
		}
		if (pulling) model.cancel();
		reset();
		const landedAtEdge = overscrollPx() >= -AT_BOUNDARY_PX;
		ours =
			landedOnList &&
			chainAllowsPull({
				start,
				root: scroller,
				position,
				honorNoPull: honorNoPull && landedAtEdge,
			});
		if (!ours) return;
		trackFingers(event.changedTouches);
		seenInBounds = overscrollPx() <= PAST_EDGE_PX;
		followFrames();
	};

	const onTouchEnd = (event: TouchEvent) => {
		if (anyFingerOnList(event.touches)) return;
		sample();
		if (pulling) model.release();
		reset();
	};

	const onTouchCancel = (event: TouchEvent) => {
		if (!anyFingerOnList(event.changedTouches)) return;
		if (pulling) model.cancel();
		reset();
	};

	addEventListener("touchstart", onTouchStart, FINGER_PHASE);
	addEventListener("touchend", onTouchEnd, FINGER_PHASE);
	addEventListener("touchcancel", onTouchCancel, FINGER_PHASE);
	scroller.addEventListener("scroll", sample, { passive: true });
	return () => {
		removeEventListener("touchstart", onTouchStart, FINGER_PHASE);
		removeEventListener("touchend", onTouchEnd, FINGER_PHASE);
		removeEventListener("touchcancel", onTouchCancel, FINGER_PHASE);
		scroller.removeEventListener("scroll", sample);
		if (pulling) model.cancel();
		reset();
	};
}
