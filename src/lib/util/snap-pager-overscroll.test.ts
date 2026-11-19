import { afterEach, describe, expect, it, vi } from "vitest";

import { detachPagers, harness, WIDTH } from "./snap-pager-test-helpers";

afterEach(() => {
	detachPagers();
	vi.useRealTimers();
	vi.unstubAllGlobals();
	document.body.replaceChildren();
});

const LAST = 4 * WIDTH;

function releasedPast(left: number) {
	vi.useFakeTimers();
	const h = harness();
	h.touch("touchstart");
	h.scroll(left);
	h.touch("touchend");
	return h;
}

function advanceFrames(frames: number) {
	for (let frame = 0; frame < frames; frame += 1)
		vi.advanceTimersToNextFrame();
}

describe("SnapPager while the engine bounces it back from past an end", () => {
	it("leaves a pager pulled past the last profile to the bounce and rests where it lands", () => {
		const h = releasedPast(LAST + 62);

		advanceFrames(5);
		h.scroll(LAST + 1);
		advanceFrames(5);
		expect(h.scrollTo).not.toHaveBeenCalled();
		expect(vi.getTimerCount()).toBe(0);

		h.scroll(LAST);
		expect(h.onRest).toHaveBeenCalledExactlyOnceWith(4);
	});

	it("leaves a pager pulled before the first profile to the bounce", () => {
		const h = releasedPast(-40);

		advanceFrames(5);
		expect(h.scrollTo).not.toHaveBeenCalled();

		h.scroll(0);
		expect(h.onRest).toHaveBeenCalledExactlyOnceWith(0);
	});

	it("does not glide on a scrollend that fires mid-bounce", () => {
		const h = harness();

		h.node.scrollLeft = LAST + 30;
		h.node.dispatchEvent(new Event("scrollend"));

		expect(h.scrollTo).not.toHaveBeenCalled();
	});
});
