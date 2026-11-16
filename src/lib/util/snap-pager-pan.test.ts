import { afterEach, describe, expect, it, vi } from "vitest";

import { detachPagers, harness, WIDTH } from "./snap-pager-test-helpers";

afterEach(() => {
	detachPagers();
	vi.useRealTimers();
	vi.unstubAllGlobals();
	document.body.replaceChildren();
});

const START = { x: 300, y: 400 };
const SWIPED_LEFT = { x: 80, y: 410 };
const SWIPED_RIGHT = { x: 380, y: 410 };

function restingOnSecond({ count }: { count?: number } = {}) {
	vi.useFakeTimers();
	const h = harness(count === undefined ? {} : { count });
	h.node.scrollLeft = WIDTH;
	h.scroll(WIDTH);
	h.onRest.mockClear();
	return h;
}

describe("SnapPager when a swipe lifts before its pan reaches the page", () => {
	it("waits for the swipe's own scroll back toward the previous profile", () => {
		const h = restingOnSecond();
		h.touch("touchstart", START);
		h.touch("touchend", SWIPED_RIGHT);
		expect(h.onRest).not.toHaveBeenCalled();

		h.scroll(0.6 * WIDTH);
		h.scroll(0);

		expect(h.onRest).toHaveBeenCalledExactlyOnceWith(0);
		expect(vi.getTimerCount()).toBe(0);
	});

	it("rests at once when the swipe points past the last profile", () => {
		const h = restingOnSecond({ count: 2 });
		h.touch("touchstart", START);
		h.touch("touchend", SWIPED_LEFT);

		expect(h.onRest).toHaveBeenCalledExactlyOnceWith(1);
		expect(vi.getTimerCount()).toBe(0);
	});

	it("rests at the lift when the swipe already carried the pager onto a profile", () => {
		vi.useFakeTimers();
		const h = harness();
		h.touch("touchstart", START);
		h.scroll(WIDTH);
		h.touch("touchend", SWIPED_LEFT);

		expect(h.onRest).toHaveBeenCalledExactlyOnceWith(1);
		expect(vi.getTimerCount()).toBe(0);
	});

	it("judges the pan by the finger that started it", () => {
		const h = restingOnSecond();
		h.touch("touchstart", { id: 0, ...START });
		h.touch("touchstart", { id: 1, ...SWIPED_LEFT });
		h.touch("touchend", { id: 0, ...START });
		h.touch("touchend", { id: 1, ...SWIPED_LEFT });

		expect(h.onRest).toHaveBeenCalledExactlyOnceWith(1);
		expect(vi.getTimerCount()).toBe(0);
	});
});
