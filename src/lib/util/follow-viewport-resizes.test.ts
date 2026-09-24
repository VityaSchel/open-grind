import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { followViewportResizes } from "./follow-viewport-resizes";

const SETTLE_MS = 100;

let stop: (() => void) | undefined;
let frames = 0;

function following() {
	frames = 0;
	stop = followViewportResizes({
		settleMs: SETTLE_MS,
		onFrame: () => frames++,
	});
}

function resize() {
	window.dispatchEvent(new Event("resize"));
}

function waitFrames(count: number) {
	for (let i = 0; i < count; i++) vi.advanceTimersToNextFrame();
}

beforeEach(() => {
	vi.useFakeTimers({
		toFake: [
			"requestAnimationFrame",
			"cancelAnimationFrame",
			"performance",
		],
	});
});

afterEach(() => {
	stop?.();
	stop = undefined;
	vi.useRealTimers();
});

describe("followViewportResizes", () => {
	it("does nothing until the viewport resizes", () => {
		following();
		waitFrames(10);
		expect(frames).toBe(0);
	});

	it("runs at once and then every frame until the viewport settles", () => {
		following();
		resize();
		expect(frames).toBe(1);

		waitFrames(3);
		expect(frames).toBe(4);

		vi.advanceTimersByTime(SETTLE_MS);
		const settled = frames;
		waitFrames(10);
		expect(frames).toBe(settled);
		expect(vi.getTimerCount()).toBe(0);
	});

	it("keeps following while resizes keep coming, without doubling up", () => {
		following();
		resize();
		vi.advanceTimersByTime(SETTLE_MS * 0.8);
		resize();
		const beforeSecondWindow = frames;

		waitFrames(3);
		expect(frames).toBe(beforeSecondWindow + 3);

		vi.advanceTimersByTime(SETTLE_MS);
		expect(vi.getTimerCount()).toBe(0);
	});

	it("stops following once stopped", () => {
		following();
		resize();
		stop?.();
		stop = undefined;

		waitFrames(3);
		resize();
		expect(frames).toBe(1);
		expect(vi.getTimerCount()).toBe(0);
	});
});
