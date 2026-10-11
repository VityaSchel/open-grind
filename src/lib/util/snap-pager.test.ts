import { afterEach, describe, expect, it, vi } from "vitest";

import {
	detachPagers,
	harness,
	macosGesture,
	WIDTH,
} from "./snap-pager-test-helpers";

afterEach(() => {
	detachPagers();
	vi.useRealTimers();
	vi.unstubAllGlobals();
	document.body.replaceChildren();
});

describe("SnapPager rests on an aligned pager", () => {
	it("rests when a scroll lands on a profile", () => {
		const h = harness();

		h.scroll(2 * WIDTH);

		expect(h.onRest).toHaveBeenCalledExactlyOnceWith(2);
	});

	it("rests under a pixel off a profile, and not a pixel off", () => {
		const h = harness();

		h.scroll(2 * WIDTH + 1);
		expect(h.onRest).not.toHaveBeenCalled();

		h.scroll(2 * WIDTH - 0.9);
		expect(h.onRest).toHaveBeenCalledExactlyOnceWith(2);
	});

	it("does not snap an unaligned pager at the moment of the lift", () => {
		const h = harness();

		h.touch("touchstart");
		h.scroll(1.3 * WIDTH);
		h.touch("touchend");

		expect(h.onRest).not.toHaveBeenCalled();
		expect(h.scrollTo).not.toHaveBeenCalled();
	});

	it("does not rest on scrollend alone", () => {
		const h = harness();

		h.node.scrollLeft = 2 * WIDTH;
		h.node.dispatchEvent(new Event("scrollend"));

		expect(h.onRest).not.toHaveBeenCalled();
		expect(h.scrollTo).not.toHaveBeenCalled();
	});

	it("rests on the aligned landing of a sideways wheel, which has no hold", () => {
		const h = harness();

		h.wheel({ deltaX: 40 });
		h.scroll(0.5 * WIDTH);
		expect(h.onRest).not.toHaveBeenCalled();
		h.scroll(WIDTH);

		expect(h.onRest).toHaveBeenCalledExactlyOnceWith(1);
	});

	it("does not rest on a lift while the measured width lags the layout", () => {
		const h = harness();

		h.touch("touchstart");
		h.relayout(2 * WIDTH);
		h.scroll(4 * WIDTH);
		h.touch("touchend");

		expect(h.onRest).not.toHaveBeenCalled();
	});
});

describe("SnapPager on a screen whose CSS width splits a layout unit", () => {
	const DEVICE_PIXEL_RATIO = 2.6875;
	const DEVICE_PIXELS = 1221;
	const EXACT_WIDTH = DEVICE_PIXELS / DEVICE_PIXEL_RATIO;
	const FLOORED_WIDTH = 454.3125;
	const DEEP = 90;

	function deepPager() {
		vi.stubGlobal("devicePixelRatio", DEVICE_PIXEL_RATIO);
		return harness({ count: 120, measured: false });
	}

	it("opens a deep pane alone on its stop and rests there", () => {
		const h = deepPager();

		h.pager.place(DEEP);
		h.measureBoxes({
			contentBox: FLOORED_WIDTH,
			devicePixels: DEVICE_PIXELS,
		});
		h.scroll(DEEP * EXACT_WIDTH);

		expect(h.onVisible).toHaveBeenLastCalledWith({
			first: DEEP,
			last: DEEP,
		});
		expect(h.onHeading).toHaveBeenLastCalledWith(DEEP);
		expect(h.onRest).toHaveBeenLastCalledWith(DEEP);
		expect(h.scrollTo).toHaveBeenCalledExactlyOnceWith({
			left: DEEP * EXACT_WIDTH,
			behavior: "instant",
		});
	});

	it("rests where a swipe lands on a deep pane", () => {
		const h = deepPager();
		h.measureBoxes({
			contentBox: FLOORED_WIDTH,
			devicePixels: DEVICE_PIXELS,
		});
		h.pager.place(DEEP - 1);
		h.scroll((DEEP - 1) * EXACT_WIDTH);

		h.touch("touchstart");
		h.scroll((DEEP - 0.5) * EXACT_WIDTH);
		h.scroll(DEEP * EXACT_WIDTH);
		h.touch("touchend");

		expect(h.onVisible).toHaveBeenLastCalledWith({
			first: DEEP,
			last: DEEP,
		});
		expect(h.onRest).toHaveBeenLastCalledWith(DEEP);
	});

	it("pages by the content box where the engine reports no device pixels", () => {
		const h = deepPager();

		h.pager.place(DEEP);
		h.measure(FLOORED_WIDTH);
		h.scroll(DEEP * FLOORED_WIDTH);

		expect(h.scrollTo).toHaveBeenCalledExactlyOnceWith({
			left: DEEP * FLOORED_WIDTH,
			behavior: "instant",
		});
		expect(h.onRest).toHaveBeenLastCalledWith(DEEP);
	});

	it("pages by the content box where device pixels round off a fractional width", () => {
		const h = harness({ count: 120, measured: false });

		h.pager.place(DEEP);
		h.measureBoxes({ contentBox: 400.296875, devicePixels: 400 });

		expect(h.scrollTo).toHaveBeenCalledExactlyOnceWith({
			left: DEEP * 400.296875,
			behavior: "instant",
		});
	});
});

describe("SnapPager under its own touches", () => {
	it("waits for the finger to lift before resting", () => {
		const h = harness();

		h.touch("touchstart");
		h.scroll(2 * WIDTH);
		expect(h.onRest).not.toHaveBeenCalled();

		h.touch("touchend");

		expect(h.onRest).toHaveBeenCalledExactlyOnceWith(2);
	});

	it("waits for every finger that touched the pager", () => {
		const h = harness();

		h.touch("touchstart", { id: 0 });
		h.touch("touchstart", { id: 1 });
		h.scroll(WIDTH);
		h.touch("touchend", { id: 0 });
		expect(h.onRest).not.toHaveBeenCalled();

		h.touch("touchend", { id: 1 });

		expect(h.onRest).toHaveBeenCalledExactlyOnceWith(1);
	});

	it("is held by a finger resting anywhere on screen, which still drives the scroll", () => {
		const h = harness();
		const navBar = document.createElement("nav");
		document.body.append(navBar);

		h.touch("touchstart", { id: 0 });
		h.touch("touchstart", { id: 1, target: navBar });
		h.scroll(WIDTH);
		h.touch("touchend", { id: 0 });
		expect(h.onRest).not.toHaveBeenCalled();

		h.touch("touchend", { id: 1, target: navBar });

		expect(h.onRest).toHaveBeenCalledExactlyOnceWith(1);
	});

	it("counts a touchcancel as a lift", () => {
		const h = harness();

		h.touch("touchstart");
		h.scroll(WIDTH);
		h.touch("touchcancel");

		expect(h.onRest).toHaveBeenCalledExactlyOnceWith(1);
	});

	it("still sees the lift when the touched node was detached mid-gesture", () => {
		const h = harness();

		h.touch("touchstart");
		h.scroll(WIDTH);
		h.child.remove();
		h.touch("touchend", { target: h.child });

		expect(h.onRest).toHaveBeenCalledExactlyOnceWith(1);
	});

	it("still sees a lift another listener stops at the touched node", () => {
		const h = harness();
		h.child.addEventListener(
			"touchend",
			(event) => event.stopImmediatePropagation(),
			{ capture: true },
		);

		h.touch("touchstart");
		h.scroll(WIDTH);
		h.touch("touchend");

		expect(h.onRest).toHaveBeenCalledExactlyOnceWith(1);
	});

	it("lets go of the touched node's listeners at the lift", () => {
		const h = harness();
		const addEventListener = vi.spyOn(h.child, "addEventListener");

		h.touch("touchstart");
		h.touch("touchend");

		const signals = addEventListener.mock.calls.map(
			([, , options]) => (options as AddEventListenerOptions).signal,
		);
		expect(signals).toHaveLength(2);
		expect(signals.every((signal) => signal?.aborted)).toBe(true);
	});
});

describe("SnapPager when the engine leaves it between profiles", () => {
	it("glides to the nearest profile once scrolling ends", () => {
		const h = harness();

		h.node.scrollLeft = 1.3 * WIDTH;
		h.node.dispatchEvent(new Event("scrollend"));

		expect(h.scrollTo).toHaveBeenCalledExactlyOnceWith({
			left: WIDTH,
			behavior: "smooth",
		});
		expect(h.onRest).not.toHaveBeenCalled();
	});

	it("jumps there under reduced motion", () => {
		const h = harness({ reducedMotion: true });

		h.node.scrollLeft = 1.7 * WIDTH;
		h.node.dispatchEvent(new Event("scrollend"));

		expect(h.scrollTo).toHaveBeenCalledExactlyOnceWith({
			left: 2 * WIDTH,
			behavior: "instant",
		});
	});

	it("leaves it to a finger that is still down", () => {
		const h = harness();

		h.touch("touchstart");
		h.node.scrollLeft = 1.3 * WIDTH;
		h.node.dispatchEvent(new Event("scrollend"));

		expect(h.scrollTo).not.toHaveBeenCalled();
	});

	it("leaves a running arrow-key step alone", () => {
		const h = harness();

		h.pager.step(1);
		h.scrollTo.mockClear();
		h.node.scrollLeft = 0.4 * WIDTH;
		h.node.dispatchEvent(new Event("scrollend"));

		expect(h.scrollTo).not.toHaveBeenCalled();
	});
});

describe("SnapPager after the last finger lifts off a profile", () => {
	function releasedBetween() {
		vi.useFakeTimers();
		const h = harness();
		h.touch("touchstart");
		h.scroll(1.3 * WIDTH);
		h.touch("touchend");
		return h;
	}

	it("glides to the nearest profile once three frames pass with nothing moving it", () => {
		const h = releasedBetween();

		vi.advanceTimersToNextFrame();
		vi.advanceTimersToNextFrame();
		expect(h.scrollTo).not.toHaveBeenCalled();
		vi.advanceTimersToNextFrame();

		expect(h.scrollTo).toHaveBeenCalledExactlyOnceWith({
			left: WIDTH,
			behavior: "smooth",
		});
		expect(vi.getTimerCount()).toBe(0);
	});

	it("leaves the pager to the engine while it keeps moving, and stops watching once it lands", () => {
		const h = releasedBetween();

		for (const left of [1.2, 1.1, 1.05].map((page) => page * WIDTH)) {
			vi.advanceTimersToNextFrame();
			vi.advanceTimersToNextFrame();
			h.scroll(left);
		}
		h.scroll(WIDTH);
		vi.advanceTimersToNextFrame();

		expect(h.scrollTo).not.toHaveBeenCalled();
		expect(h.onRest).toHaveBeenCalledExactlyOnceWith(1);
		expect(vi.getTimerCount()).toBe(0);
	});

	it("stops watching when a finger lands again", () => {
		const h = releasedBetween();

		h.touch("touchstart", { id: 1 });
		vi.advanceTimersToNextFrame();
		vi.advanceTimersToNextFrame();
		vi.advanceTimersToNextFrame();

		expect(h.scrollTo).not.toHaveBeenCalled();
		expect(vi.getTimerCount()).toBe(0);
	});

	it("stops watching on teardown", () => {
		const h = releasedBetween();

		h.detach();

		expect(vi.getTimerCount()).toBe(0);
	});
});

describe("SnapPager over the macOS finger-phase bridge", () => {
	it("holds while fingers are down and rests at the release", () => {
		const mac = macosGesture();
		const h = harness({ fingerPhase: mac.gesture });

		mac.fingers();
		h.scroll(WIDTH);
		expect(h.onRest).not.toHaveBeenCalled();

		mac.released();

		expect(h.onRest).toHaveBeenCalledExactlyOnceWith(1);
	});

	it("does not hold for momentum, so a flick rests on arrival", () => {
		const mac = macosGesture();
		const h = harness({ fingerPhase: mac.gesture });

		mac.fingers();
		h.scroll(0.6 * WIDTH);
		mac.released();
		mac.momentum();
		expect(h.onRest).not.toHaveBeenCalled();

		h.scroll(WIDTH);

		expect(h.onRest).toHaveBeenCalledExactlyOnceWith(1);
	});

	it("rests a mouse wheel, which carries no phase, on its aligned scroll", () => {
		const mac = macosGesture();
		const h = harness({ fingerPhase: mac.gesture });

		h.wheel({ deltaX: 40 });
		h.scroll(WIDTH);

		expect(h.onRest).toHaveBeenCalledExactlyOnceWith(1);
	});
});

describe("SnapPager while macOS trackpad momentum carries it", () => {
	function flicked() {
		vi.useFakeTimers();
		const mac = macosGesture();
		const h = harness({ fingerPhase: mac.gesture });
		mac.fingers();
		h.scroll(0.2 * WIDTH);
		mac.released();
		mac.momentum();
		return { mac, h };
	}

	function passStillFrames() {
		for (let frame = 0; frame < 3; frame += 1)
			vi.advanceTimersToNextFrame();
	}

	it("ignores a scrollend the engine fires before the momentum is over", () => {
		const { h } = flicked();

		h.scroll(0.47 * WIDTH);
		h.node.dispatchEvent(new Event("scrollend"));

		expect(h.scrollTo).not.toHaveBeenCalled();
		expect(h.onRest).not.toHaveBeenCalled();
	});

	it("does not glide on still frames between the release and the end of the momentum", () => {
		const { h } = flicked();

		passStillFrames();
		h.scroll(0.47 * WIDTH);
		passStillFrames();

		expect(h.scrollTo).not.toHaveBeenCalled();
		expect(vi.getTimerCount()).toBe(0);
	});

	it("glides to the nearest profile on a scrollend once the trackpad is idle", () => {
		const { mac, h } = flicked();

		h.scroll(0.47 * WIDTH);
		mac.idle();
		h.node.dispatchEvent(new Event("scrollend"));

		expect(h.scrollTo).toHaveBeenCalledExactlyOnceWith({
			left: 0,
			behavior: "smooth",
		});
	});

	it("glides a pager the momentum left between profiles, three still frames after it ends", () => {
		const { mac, h } = flicked();

		h.scroll(1.3 * WIDTH);
		h.node.dispatchEvent(new Event("scrollend"));
		mac.idle();
		vi.advanceTimersToNextFrame();
		vi.advanceTimersToNextFrame();
		expect(h.scrollTo).not.toHaveBeenCalled();
		vi.advanceTimersToNextFrame();

		expect(h.scrollTo).toHaveBeenCalledExactlyOnceWith({
			left: WIDTH,
			behavior: "smooth",
		});
		expect(vi.getTimerCount()).toBe(0);
	});

	it("leaves a pager that keeps moving after the momentum ends to the engine", () => {
		const { mac, h } = flicked();

		h.scroll(0.7 * WIDTH);
		mac.idle();
		for (const left of [0.8, 0.9, 0.95].map((page) => page * WIDTH)) {
			vi.advanceTimersToNextFrame();
			vi.advanceTimersToNextFrame();
			h.scroll(left);
		}
		h.scroll(WIDTH);
		vi.advanceTimersToNextFrame();

		expect(h.scrollTo).not.toHaveBeenCalled();
		expect(h.onRest).toHaveBeenCalledExactlyOnceWith(1);
		expect(vi.getTimerCount()).toBe(0);
	});

	it("rests and never scrolls when the momentum lands on a profile", () => {
		const { mac, h } = flicked();

		h.scroll(WIDTH);
		expect(h.onRest).toHaveBeenCalledExactlyOnceWith(1);
		h.node.dispatchEvent(new Event("scrollend"));
		mac.idle();
		passStillFrames();

		expect(h.scrollTo).not.toHaveBeenCalled();
		expect(h.onRest).toHaveBeenLastCalledWith(1);
		expect(vi.getTimerCount()).toBe(0);
	});

	it("glides a pager the fingers let go of between profiles with no momentum", () => {
		vi.useFakeTimers();
		const mac = macosGesture();
		const h = harness({ fingerPhase: mac.gesture });

		mac.fingers();
		h.scroll(1.3 * WIDTH);
		mac.released();
		passStillFrames();

		expect(h.scrollTo).toHaveBeenCalledExactlyOnceWith({
			left: WIDTH,
			behavior: "smooth",
		});
	});

	it("keeps gliding on every scrollend, and watches no frames, where no bridge reports a phase", () => {
		vi.useFakeTimers();
		const h = harness();

		h.wheel({ deltaX: 40 });
		h.scroll(0.47 * WIDTH);
		h.node.dispatchEvent(new Event("scrollend"));

		expect(h.scrollTo).toHaveBeenCalledExactlyOnceWith({
			left: 0,
			behavior: "smooth",
		});
		expect(vi.getTimerCount()).toBe(0);
	});
});

describe("SnapPager schedules nothing for input that lands on a profile", () => {
	it("across touches, wheels, trackpad phases, steps, placements and resizes", () => {
		vi.useFakeTimers();
		const mac = macosGesture();
		const h = harness({ fingerPhase: mac.gesture });

		h.touch("touchstart");
		h.scroll(0.4 * WIDTH);
		h.scroll(0);
		h.touch("touchend");
		h.wheel({ deltaX: 40 });
		h.scroll(WIDTH);
		mac.fingers();
		mac.released();
		mac.momentum();
		mac.idle();
		h.pager.step(1);
		h.scroll(1.5 * WIDTH);
		h.pager.place(3, { animated: true });
		h.measure(800);
		h.pager.place(0);
		h.pager.settleNow();

		expect(h.onRest).toHaveBeenCalled();
		expect(vi.getTimerCount()).toBe(0);
	});
});

describe("SnapPager cleanup", () => {
	it("removes every listener, observer and subscription", () => {
		const mac = macosGesture();
		const h = harness({ fingerPhase: mac.gesture });

		h.detach();

		expect(h.disconnect).toHaveBeenCalledOnce();
		mac.fingers();
		mac.released();
		h.scroll(2 * WIDTH);
		h.wheel({ deltaX: 40 });
		h.touch("touchstart");
		h.touch("touchend");

		expect(h.onRest).not.toHaveBeenCalled();
		expect(h.onVisible).not.toHaveBeenCalled();
		expect(h.scrollTo).not.toHaveBeenCalled();
	});

	it("forgets fingers on teardown, so attaching again does not hold forever", () => {
		const h = harness();

		h.touch("touchstart");
		h.detach();
		h.attach();
		h.scroll(WIDTH);

		expect(h.onRest).toHaveBeenCalledExactlyOnceWith(1);
	});

	it("stops listening for the lift of a touch that started before", () => {
		const h = harness();

		h.touch("touchstart");
		h.node.scrollLeft = WIDTH;
		h.detach();
		h.touch("touchend");

		expect(h.onRest).not.toHaveBeenCalled();
	});
});
