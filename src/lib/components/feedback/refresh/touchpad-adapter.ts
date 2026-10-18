import type { ScrollGestureState } from "$lib/platform/scroll-gesture";
import type { PullModel } from "./pull-model.svelte";
import {
	AT_BOUNDARY_PX,
	chainAllowsPull,
	type PullPosition,
} from "./scroll-chain";

export interface TouchpadPullOptions {
	listenTarget: HTMLElement;
	fingerPhase: ScrollGestureState;
	boundaryDistance: () => number;
	position: PullPosition;
	onPull: () => void;
}

export function attachTouchpadPull(
	model: PullModel,
	{
		listenTarget,
		fingerPhase,
		boundaryDistance,
		position,
		onPull,
	}: TouchpadPullOptions,
): () => void {
	let landedAtPullEdge = false;
	let engaged = false;
	let pull = 0;

	const atPullEdge = () => boundaryDistance() < AT_BOUNDARY_PX;

	const letGo = () => {
		if (engaged) {
			model.cancel();
			fingerPhase.capture(false);
		}
		engaged = false;
		landedAtPullEdge = false;
	};

	const pullToward = (deltaY: number) => {
		const toward = position === "top" ? -deltaY : deltaY;
		pull = Math.max(0, pull + toward);
		model.updatePull(pull);
	};

	const engage = (event: WheelEvent): boolean => {
		if (
			!atPullEdge() ||
			!chainAllowsPull({
				start: event.target,
				root: listenTarget,
				position,
			})
		)
			return false;
		onPull();
		return model.beginPull("touch");
	};

	const onWheel = (event: WheelEvent) => {
		if (!fingerPhase.fingersDown || !landedAtPullEdge) return;
		if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
		const toward = position === "top" ? -event.deltaY : event.deltaY;
		if (!engaged) {
			if (toward <= 0 || !engage(event)) {
				landedAtPullEdge = false;
				return;
			}
			engaged = true;
			pull = 0;
			fingerPhase.capture(true);
		}
		pullToward(event.deltaY);
	};

	const onScroll = () => {
		if (!atPullEdge()) letGo();
	};

	const stopWatchingPhase = fingerPhase.onPhaseChange((phase) => {
		if (phase === "fingers") landedAtPullEdge = atPullEdge();
	});
	const stopWatchingRelease = fingerPhase.onRelease(() => {
		if (engaged) model.release();
		engaged = false;
		landedAtPullEdge = false;
	});
	const stopWatchingDeltas = fingerPhase.onDelta((_, dy) => {
		if (engaged) pullToward(dy);
	});

	listenTarget.addEventListener("wheel", onWheel, { passive: true });
	listenTarget.addEventListener("scroll", onScroll, { passive: true });
	return () => {
		listenTarget.removeEventListener("wheel", onWheel);
		listenTarget.removeEventListener("scroll", onScroll);
		stopWatchingPhase();
		stopWatchingRelease();
		stopWatchingDeltas();
		letGo();
	};
}
