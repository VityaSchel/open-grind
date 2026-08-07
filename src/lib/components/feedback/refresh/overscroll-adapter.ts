import type { PullModel } from "./pull-model.svelte";
import { AT_BOUNDARY_PX } from "./scroll-chain";

const ENGAGE_PX = 0.5;
const MOMENTUM_VELOCITY_PX_PER_MS = 1.6;
// Scroll events come in bursts, so one frame's speed on its own is unreliable.
const VELOCITY_DECAY_PER_SAMPLE = 0.85;
// Browsers skip scrollend for programmatic and zero-length scrolls, so we watch
// for a pause instead. https://github.com/w3c/csswg-drafts/issues/8218
const RESTING_GAP_MS = 250;

export interface OverscrollPullOptions {
	listenTarget: EventTarget;
	overscrollPx: () => number;
	now?: () => number;
}

export function attachOverscrollPull(
	model: PullModel,
	{
		listenTarget,
		overscrollPx,
		now = () => performance.now(),
	}: OverscrollPullOptions,
): () => void {
	let active = false;
	let suppressed = false;
	let peakArmed = false;
	let armedByFinger = false;
	let deviceEmitsWheels = false;
	let wheelThisFrame = false;
	let prevOver = overscrollPx();
	let prevAt = now();
	let velocityPeak = 0;
	let restingOver = prevOver;
	let offBoundary = restingOver < -AT_BOUNDARY_PX;
	let gestureHadWheels = false;

	const reset = () => {
		active = false;
		suppressed = false;
		peakArmed = false;
		armedByFinger = false;
		velocityPeak = 0;
	};

	const onWheel = () => {
		deviceEmitsWheels = true;
		wheelThisFrame = true;
	};

	const onScroll = () => {
		const over = overscrollPx();
		const at = now();
		const quietGapCanEndGesture = !gestureHadWheels || !offBoundary;
		if (!active && quietGapCanEndGesture && at - prevAt > RESTING_GAP_MS) {
			restingOver = prevOver;
			offBoundary = restingOver < -AT_BOUNDARY_PX;
			suppressed = false;
			velocityPeak = 0;
			gestureHadWheels = false;
		}
		const dt = Math.max(1, at - prevAt);
		velocityPeak = Math.max(
			Math.abs((over - prevOver) / dt),
			velocityPeak * VELOCITY_DECAY_PER_SAMPLE,
		);
		const cameFrom = prevOver;
		prevOver = over;
		prevAt = at;
		const fingerFrame = wheelThisFrame;
		wheelThisFrame = false;
		gestureHadWheels ||= fingerFrame;

		if (model.source === "touch") return;

		if (over <= ENGAGE_PX) {
			const scrolledIntoContent = over < -AT_BOUNDARY_PX;
			if (scrolledIntoContent) offBoundary = true;
			if (active) {
				if (scrolledIntoContent) {
					model.cancel();
					reset();
					suppressed = true;
				} else {
					model.updatePull(Math.max(0, over), { preResisted: true });
					if (fingerFrame) armedByFinger = false;
				}
			}
			return;
		}

		if (!active && !suppressed) {
			const springingBack = over <= cameFrom;
			if (
				offBoundary ||
				springingBack ||
				velocityPeak > MOMENTUM_VELOCITY_PX_PER_MS ||
				!model.beginPull("overscroll")
			) {
				suppressed = true;
			} else {
				active = true;
			}
		}
		if (active) {
			model.updatePull(over, { preResisted: true });
			if (model.phase === "armed") peakArmed = true;
			if (fingerFrame) armedByFinger = model.phase === "armed";
		}
	};

	const onScrollEnd = () => {
		if (active) {
			const fire = deviceEmitsWheels ? armedByFinger : peakArmed;
			if (fire) model.trigger();
			else model.cancel();
		}
		reset();
		restingOver = overscrollPx();
		offBoundary = restingOver < -AT_BOUNDARY_PX;
		gestureHadWheels = false;
	};

	listenTarget.addEventListener("wheel", onWheel, { passive: true });
	listenTarget.addEventListener("scroll", onScroll, { passive: true });
	listenTarget.addEventListener("scrollend", onScrollEnd, { passive: true });
	return () => {
		listenTarget.removeEventListener("wheel", onWheel);
		listenTarget.removeEventListener("scroll", onScroll);
		listenTarget.removeEventListener("scrollend", onScrollEnd);
		if (active) model.cancel();
		reset();
	};
}
