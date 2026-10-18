// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

import { ScrollGestureState } from "$lib/platform/scroll-gesture";
import { PullModel } from "./pull-model.svelte";
import { attachTouchpadPull } from "./touchpad-adapter";

const ARMING_WHEELS = 4;
const WHEEL_PX = 40;

function harness() {
	const target = document.createElement("div");
	document.body.append(target);
	const model = new PullModel();
	model.space = 18;
	const onTrigger = vi.fn();
	model.onTrigger = onTrigger;
	const onPull = vi.fn();
	const fingerPhase = new ScrollGestureState();
	const capture = vi.spyOn(fingerPhase, "capture");
	let distance = 0;
	const detach = attachTouchpadPull(model, {
		listenTarget: target,
		fingerPhase,
		boundaryDistance: () => distance,
		position: "top",
		onPull,
	});
	return {
		model,
		onTrigger,
		onPull,
		capture,
		detach,
		fingers: () => fingerPhase.ingest({ state: "fingers" }),
		capturedMotion: (dy: number) => fingerPhase.ingest({ dx: 0, dy }),
		lift: () => fingerPhase.ingest({ state: "released" }),
		wheel: ({ deltaY, deltaX = 0 }: { deltaY: number; deltaX?: number }) =>
			target.dispatchEvent(new WheelEvent("wheel", { deltaX, deltaY })),
		pullBy: (wheels: number) => {
			for (let step = 0; step < wheels; step += 1)
				target.dispatchEvent(
					new WheelEvent("wheel", { deltaY: -WHEEL_PX }),
				);
		},
		scrollTo: (px: number) => {
			distance = px;
			target.dispatchEvent(new Event("scroll"));
		},
		awayFromEdge: (px: number) => {
			distance = px;
		},
	};
}

afterEach(() => {
	document.body.replaceChildren();
});

describe("a touchpad pull where the engine draws no band", () => {
	it("pulls with wheels toward the edge and refreshes when the fingers lift armed", () => {
		const h = harness();

		h.fingers();
		h.pullBy(ARMING_WHEELS);
		expect(h.model.phase).toBe("armed");
		expect(h.model.source).toBe("touch");
		h.lift();

		expect(h.onTrigger).toHaveBeenCalledOnce();
		expect(h.model.phase).toBe("refreshing");
	});

	it("tells the caller a pull began before the model reads its baseline", () => {
		const h = harness();
		h.model.getBaseline = () => (h.onPull.mock.calls.length ? 0 : 56);

		h.fingers();
		h.pullBy(1);

		expect(h.onPull).toHaveBeenCalledOnce();
		expect(h.model.displayPx).toBeLessThan(18);
	});

	it("lets go without refreshing when the fingers lift before arming", () => {
		const h = harness();

		h.fingers();
		h.pullBy(1);
		expect(h.model.phase).toBe("pulling");
		h.lift();

		expect(h.onTrigger).not.toHaveBeenCalled();
		expect(h.model.settledOutcome).toBe("canceled");
	});

	it("never pulls in a gesture that began away from the edge", () => {
		const h = harness();

		h.awayFromEdge(40);
		h.fingers();
		h.scrollTo(0);
		h.pullBy(ARMING_WHEELS);

		expect(h.model.gestureActive).toBe(false);
	});

	it("cancels a pull the list scrolls away from, and stays out for the rest of the gesture", () => {
		const h = harness();

		h.fingers();
		h.pullBy(ARMING_WHEELS);
		h.scrollTo(30);
		expect(h.model.settledOutcome).toBe("canceled");
		h.scrollTo(0);
		h.pullBy(ARMING_WHEELS);
		h.lift();

		expect(h.model.gestureActive).toBe(false);
		expect(h.onTrigger).not.toHaveBeenCalled();
	});

	it("leaves wheels without fingers on the touchpad, like a mouse's, alone", () => {
		const h = harness();

		h.pullBy(ARMING_WHEELS);

		expect(h.model.gestureActive).toBe(false);
		expect(h.onPull).not.toHaveBeenCalled();
	});

	it("never pulls on a sideways or away-from-the-edge wheel", () => {
		const h = harness();

		h.fingers();
		h.wheel({ deltaY: -10, deltaX: 30 });
		h.wheel({ deltaY: 40 });
		h.pullBy(ARMING_WHEELS);

		expect(h.model.gestureActive).toBe(false);
	});

	it("cancels a pull still held when it detaches", () => {
		const h = harness();

		h.fingers();
		h.pullBy(ARMING_WHEELS);
		h.detach();

		expect(h.model.settledOutcome).toBe("canceled");
	});

	it("locks the pull in once it engages, so motion away from the edge shrinks it instead of scrolling the list", () => {
		const h = harness();

		h.fingers();
		h.pullBy(ARMING_WHEELS);
		expect(h.capture).toHaveBeenCalledExactlyOnceWith(true);
		const armedPx = h.model.displayPx;
		h.capturedMotion(WHEEL_PX * ARMING_WHEELS);
		expect(h.model.phase).toBe("pulling");
		expect(h.model.displayPx).toBeLessThan(armedPx);
		h.capturedMotion(-WHEEL_PX * ARMING_WHEELS);
		expect(h.model.phase).toBe("armed");
		h.lift();

		expect(h.onTrigger).toHaveBeenCalledOnce();
	});

	it("hands the gesture back when a pull is let go of before the fingers lift", () => {
		const h = harness();

		h.fingers();
		h.pullBy(ARMING_WHEELS);
		h.scrollTo(30);

		expect(h.capture).toHaveBeenLastCalledWith(false);
	});
});
