import { afterEach, describe, expect, it, vi } from "vitest";

import { detachPagers, harness, WIDTH } from "./snap-pager-test-helpers";

afterEach(() => {
	detachPagers();
	vi.unstubAllGlobals();
	document.body.replaceChildren();
});

const START = { x: 300, y: 400 };
const SWIPED_LEFT = { x: 80, y: 410 };
const SWIPED_RIGHT = { x: 380, y: 410 };

function liftPan({
	from = START,
	to,
	type = "touchend",
	cancelable = false,
}: {
	from?: { x: number; y: number };
	to: { x: number; y: number };
	type?: "touchend" | "touchcancel";
	cancelable?: boolean;
}) {
	const h = harness();
	h.node.scrollLeft = WIDTH;
	h.scroll(WIDTH);
	h.onRest.mockClear();
	h.touch("touchstart", { at: from });
	h.touch(type, { at: to, cancelable });
	return h;
}

function stopAnotherScroller() {
	const list = document.createElement("div");
	document.body.append(list);
	list.dispatchEvent(new Event("scrollend"));
}

describe("SnapPager at the lift of a pan the page has not seen move it", () => {
	it("leaves the rest to the swipe's own scroll toward the next profile", () => {
		const h = liftPan({ to: SWIPED_LEFT });
		expect(h.onRest).not.toHaveBeenCalled();

		h.scroll(1.4 * WIDTH);
		h.scroll(2 * WIDTH);

		expect(h.onRest).toHaveBeenCalledExactlyOnceWith(2);
		expect(h.scrollTo).not.toHaveBeenCalled();
	});

	it("leaves the rest to the swipe's own scroll back toward the previous profile", () => {
		const h = liftPan({ to: SWIPED_RIGHT });
		expect(h.onRest).not.toHaveBeenCalled();

		h.scroll(0.6 * WIDTH);
		h.scroll(0);

		expect(h.onRest).toHaveBeenCalledExactlyOnceWith(0);
	});

	it("rests where it is once another scroller that took the pan stops", () => {
		const h = liftPan({ to: SWIPED_LEFT });
		expect(h.onRest).not.toHaveBeenCalled();

		stopAnotherScroller();

		expect(h.onRest).toHaveBeenCalledExactlyOnceWith(1);
		expect(h.scrollTo).not.toHaveBeenCalled();
	});

	it("leaves the rest to its own scroll once it comes, whatever scroller stops after", () => {
		const h = liftPan({ to: SWIPED_LEFT });
		h.scroll(1.4 * WIDTH);
		h.scroll(2 * WIDTH);

		stopAnotherScroller();

		expect(h.onRest).toHaveBeenCalledExactlyOnceWith(2);
	});

	it("ignores another scroller stopping after a lift that already rested", () => {
		const h = liftPan({ to: SWIPED_LEFT, cancelable: true });
		h.onRest.mockClear();

		stopAnotherScroller();

		expect(h.onRest).not.toHaveBeenCalled();
	});

	it("rests at once when the swipe points past the first profile", () => {
		const h = harness();
		h.touch("touchstart", { at: START });
		h.touch("touchend", { at: SWIPED_RIGHT, cancelable: false });

		expect(h.onRest).toHaveBeenCalledExactlyOnceWith(0);
	});

	it("rests at once when the swipe points past the last profile", () => {
		const h = harness({ count: 2 });
		h.node.scrollLeft = WIDTH;
		h.scroll(WIDTH);
		h.onRest.mockClear();
		h.touch("touchstart", { at: START });
		h.touch("touchend", { at: SWIPED_LEFT, cancelable: false });

		expect(h.onRest).toHaveBeenCalledExactlyOnceWith(1);
	});

	it("rests at once on a lift the page could still cancel, which no pan took", () => {
		const h = liftPan({ to: SWIPED_LEFT, cancelable: true });

		expect(h.onRest).toHaveBeenCalledExactlyOnceWith(1);
	});

	it("rests at once when the pan ran mostly up the screen", () => {
		const h = liftPan({ to: { x: 260, y: 100 } });

		expect(h.onRest).toHaveBeenCalledExactlyOnceWith(1);
	});

	it("rests at once on a touchcancel, which ends the pan without a scroll", () => {
		const h = liftPan({ to: SWIPED_LEFT, type: "touchcancel" });

		expect(h.onRest).toHaveBeenCalledExactlyOnceWith(1);
	});

	it("rests at the lift when the swipe already carried the pager onto a profile", () => {
		const h = harness();
		h.touch("touchstart", { at: START });
		h.scroll(WIDTH);
		h.touch("touchend", { at: SWIPED_LEFT, cancelable: false });

		expect(h.onRest).toHaveBeenCalledExactlyOnceWith(1);
	});

	it("judges the pan by the finger that started it", () => {
		const h = harness();
		h.node.scrollLeft = WIDTH;
		h.scroll(WIDTH);
		h.onRest.mockClear();
		h.touch("touchstart", { id: 0, at: START });
		h.touch("touchstart", { id: 1, at: SWIPED_LEFT });
		h.touch("touchend", { id: 0, at: START, cancelable: false });
		h.touch("touchend", { id: 1, at: SWIPED_LEFT, cancelable: false });

		expect(h.onRest).toHaveBeenCalledExactlyOnceWith(1);
	});
});
