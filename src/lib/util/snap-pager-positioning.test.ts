import { afterEach, describe, expect, it, vi } from "vitest";

import {
	detachPagers,
	harness,
	macosGesture,
	WIDTH,
} from "./snap-pager-test-helpers";

afterEach(() => {
	detachPagers();
	vi.unstubAllGlobals();
	document.body.replaceChildren();
});

describe("SnapPager.step", () => {
	it("accumulates presses made before the scroll settles", () => {
		const h = harness();

		h.pager.step(1);
		h.scroll(0.4 * WIDTH);
		h.pager.step(1);

		expect(h.scrollTo).toHaveBeenLastCalledWith({
			left: 2 * WIDTH,
			behavior: "smooth",
		});
	});

	it("steps from wherever the pager is once a step has rested", () => {
		const h = harness();

		h.pager.step(1);
		h.scroll(WIDTH);
		h.touch("touchstart");
		h.scroll(3 * WIDTH);
		h.touch("touchend");
		h.pager.step(1);

		expect(h.scrollTo).toHaveBeenLastCalledWith({
			left: 4 * WIDTH,
			behavior: "smooth",
		});
	});

	it("stops at the last profile", () => {
		const h = harness({ count: 3 });

		for (let press = 0; press < 5; press++) h.pager.step(1);

		expect(h.scrollTo).toHaveBeenLastCalledWith({
			left: 2 * WIDTH,
			behavior: "smooth",
		});
	});

	it("does nothing while a finger is down", () => {
		const h = harness();

		h.touch("touchstart");
		h.pager.step(1);

		expect(h.scrollTo).not.toHaveBeenCalled();
	});

	it("does nothing while fingers rest on the macOS trackpad", () => {
		const mac = macosGesture();
		const h = harness({ fingerPhase: mac.gesture });

		mac.fingers();
		h.pager.step(1);

		expect(h.scrollTo).not.toHaveBeenCalled();
	});

	it("steps during momentum only once the pager is aligned", () => {
		const mac = macosGesture();
		const h = harness({ fingerPhase: mac.gesture });

		mac.momentum();
		h.scroll(0.5 * WIDTH);
		h.pager.step(1);
		expect(h.scrollTo).not.toHaveBeenCalled();

		h.scroll(WIDTH);
		h.pager.step(1);

		expect(h.scrollTo).toHaveBeenCalledExactlyOnceWith({
			left: 2 * WIDTH,
			behavior: "smooth",
		});
	});

	it("steps instantly under reduced motion", () => {
		const h = harness({ reducedMotion: true });

		h.pager.step(1);

		expect(h.scrollTo).toHaveBeenCalledExactlyOnceWith({
			left: WIDTH,
			behavior: "instant",
		});
	});

	it("rests only at its target, never at a profile it passes", () => {
		const h = harness();

		h.pager.step(1);
		h.pager.step(1);
		h.scroll(WIDTH);
		expect(h.onRest).not.toHaveBeenCalled();

		h.scroll(2 * WIDTH);

		expect(h.onRest).toHaveBeenCalledExactlyOnceWith(2);
	});

	it("drops its target on a pointer press", () => {
		const h = harness();

		h.pager.step(1);
		h.pager.step(1);
		h.pointerDown();
		h.scroll(WIDTH);

		expect(h.onRest).toHaveBeenCalledExactlyOnceWith(1);
	});

	it("drops its target on a sideways or shifted wheel, not a vertical one", () => {
		const h = harness();

		h.pager.step(1);
		h.pager.step(1);
		h.wheel({ deltaX: 2, deltaY: 60 });
		h.scroll(WIDTH);
		expect(h.onRest).not.toHaveBeenCalled();

		h.wheel({ deltaX: 40 });
		h.scroll(WIDTH);
		expect(h.onRest).toHaveBeenCalledExactlyOnceWith(1);

		h.pager.step(2);
		h.wheel({ deltaX: 0, deltaY: 100, shiftKey: true });
		h.scroll(2 * WIDTH);
		expect(h.onRest).toHaveBeenLastCalledWith(2);
	});

	it("drops its target when focus moves into the pager", () => {
		const h = harness();

		h.pager.step(1);
		h.pager.step(1);
		h.focusIn();
		h.scroll(0);
		expect(h.onRest).toHaveBeenCalledExactlyOnceWith(0);

		h.pager.step(1);

		expect(h.scrollTo).toHaveBeenLastCalledWith({
			left: WIDTH,
			behavior: "smooth",
		});
	});
});

describe("SnapPager.place", () => {
	it("leaves an already aligned pager alone", () => {
		const h = harness();

		h.scroll(2 * WIDTH);
		h.pager.place(2);

		expect(h.scrollTo).not.toHaveBeenCalled();
	});

	it("drops a pending step target and scrolls instantly", () => {
		const h = harness();

		h.pager.step(1);
		h.scroll(0.5 * WIDTH);
		h.pager.place(0);

		expect(h.scrollTo).toHaveBeenLastCalledWith({
			left: 0,
			behavior: "instant",
		});

		h.pager.step(1);
		expect(h.scrollTo).toHaveBeenLastCalledWith({
			left: WIDTH,
			behavior: "smooth",
		});
	});

	it("waits for the first measurement before scrolling", () => {
		const h = harness({ measured: false });

		h.pager.place(3);
		expect(h.scrollTo).not.toHaveBeenCalled();

		h.measure(WIDTH);

		expect(h.scrollTo).toHaveBeenCalledExactlyOnceWith({
			left: 3 * WIDTH,
			behavior: "instant",
		});
		expect(h.onRest).toHaveBeenCalledExactlyOnceWith(3);

		h.scroll(WIDTH);
		h.measure(800);

		expect(
			h.scrollTo,
			"a later resize must not replay the placement",
		).toHaveBeenLastCalledWith({ left: 800, behavior: "instant" });
	});

	it("animates to a position and rests only there", () => {
		const h = harness();

		h.pager.place(3, { animated: true });
		expect(h.scrollTo).toHaveBeenCalledExactlyOnceWith({
			left: 3 * WIDTH,
			behavior: "smooth",
		});

		h.scroll(WIDTH);
		expect(h.onRest).not.toHaveBeenCalled();
		h.scroll(3 * WIDTH);

		expect(h.onRest).toHaveBeenCalledExactlyOnceWith(3);
	});

	it("realigns to an animated placement when the width changes mid-scroll", () => {
		const h = harness();

		h.scroll(2 * WIDTH);
		h.pager.place(0, { animated: true });
		h.scroll(1.6 * WIDTH);
		h.onRest.mockClear();
		h.measure(800);

		expect(h.scrollTo).toHaveBeenLastCalledWith({
			left: 0,
			behavior: "instant",
		});
		expect(h.onRest).toHaveBeenCalledExactlyOnceWith(0);
	});
});

describe("SnapPager on resize", () => {
	it("keeps the profile that was showing when the width changes", () => {
		const h = harness();

		h.scroll(2 * WIDTH);
		h.measure(800);

		expect(h.scrollTo).toHaveBeenCalledExactlyOnceWith({
			left: 1600,
			behavior: "instant",
		});
	});

	it("leaves a pager the engine already re-snapped to the new width", () => {
		const h = harness();

		h.scroll(2 * WIDTH);
		h.node.scrollLeft = 1600;
		h.measure(800);

		expect(h.scrollTo).not.toHaveBeenCalled();
	});

	it("ignores the re-snap WebKit dispatches before the new width is measured", () => {
		const h = harness();

		h.scroll(2 * WIDTH);
		h.onVisible.mockClear();
		h.onRest.mockClear();

		h.relayout(2 * WIDTH);
		h.scroll(4 * WIDTH);
		h.measure(2 * WIDTH);

		expect(h.onVisible).not.toHaveBeenCalled();
		expect(h.scrollTo).not.toHaveBeenCalled();
		expect(h.onRest).toHaveBeenCalledExactlyOnceWith(2);
	});

	it("keeps a placed profile when the width changes before its scroll event", () => {
		const h = harness();

		h.pager.place(3);
		h.measure(800);

		expect(h.onVisible).toHaveBeenCalledExactlyOnceWith({
			first: 3,
			last: 3,
		});
		expect(h.scrollTo).toHaveBeenLastCalledWith({
			left: 2400,
			behavior: "instant",
		});
	});

	it("keeps a running step's target when the width changes", () => {
		const h = harness();

		h.pager.step(1);
		h.scroll(0.4 * WIDTH);
		h.measure(800);

		expect(h.scrollTo).toHaveBeenLastCalledWith({
			left: 800,
			behavior: "instant",
		});
	});

	it("does not realign while a finger is down", () => {
		const h = harness();

		h.touch("touchstart");
		h.scroll(2 * WIDTH);
		h.measure(800);

		expect(h.scrollTo).not.toHaveBeenCalled();
	});
});

describe("SnapPager visible tracking", () => {
	it("reports every pane the viewport overlaps, once per change", () => {
		const h = harness();

		h.scroll(0.2 * WIDTH);
		h.scroll(0.4 * WIDTH);
		h.scroll(0.9 * WIDTH);
		h.scroll(WIDTH);
		h.scroll(1.6 * WIDTH);

		expect(h.onVisible.mock.calls).toEqual([
			[{ first: 0, last: 1 }],
			[{ first: 1, last: 1 }],
			[{ first: 1, last: 2 }],
		]);
	});

	it("never reports a pane the pager cannot reach", () => {
		const h = harness({ count: 2 });

		h.scroll(0.5 * WIDTH);
		h.scroll(-0.4 * WIDTH);
		h.scroll(1.4 * WIDTH);

		expect(h.onVisible.mock.calls).toEqual([
			[{ first: 0, last: 1 }],
			[{ first: 0, last: 0 }],
			[{ first: 1, last: 1 }],
		]);
	});

	it("reports the real offset at the first measurement, and nothing before", () => {
		const h = harness({ measured: false });

		h.scroll(2.2 * WIDTH);
		expect(h.onVisible).not.toHaveBeenCalled();

		h.measure(WIDTH);
		expect(h.onVisible).toHaveBeenCalledExactlyOnceWith({
			first: 2,
			last: 2,
		});

		h.scroll(2.3 * WIDTH);

		expect(h.onVisible).toHaveBeenLastCalledWith({ first: 2, last: 3 });
	});

	it("realigns a later resize to the position found at the first measurement", () => {
		const h = harness({ measured: false });

		h.node.scrollLeft = 1.2 * WIDTH;
		h.measure(WIDTH);
		h.measure(800);

		expect(h.scrollTo).toHaveBeenCalledExactlyOnceWith({
			left: 800,
			behavior: "instant",
		});
	});

	it("rests at the first measurement on a pager scrolled before it", () => {
		const h = harness({ measured: false });

		h.scroll(WIDTH);
		expect(h.onRest).not.toHaveBeenCalled();

		h.measure(WIDTH);

		expect(h.onRest).toHaveBeenCalledExactlyOnceWith(1);
	});
});

describe("SnapPager.settleNow", () => {
	it("rests at once on an aligned, released pager", () => {
		const h = harness();

		h.node.scrollLeft = WIDTH;
		h.pager.settleNow();

		expect(h.onRest).toHaveBeenCalledExactlyOnceWith(1);
	});

	it("leaves an unaligned, released pager where it is", () => {
		const h = harness();

		h.node.scrollLeft = 1.3 * WIDTH;
		h.pager.settleNow();

		expect(h.onRest).not.toHaveBeenCalled();
		expect(h.scrollTo).not.toHaveBeenCalled();
	});

	it("waits for the lift while a finger is down", () => {
		const h = harness();

		h.touch("touchstart");
		h.scroll(WIDTH);
		h.pager.settleNow();
		expect(h.onRest).not.toHaveBeenCalled();

		h.touch("touchend");

		expect(h.onRest).toHaveBeenCalledExactlyOnceWith(1);
	});
});
