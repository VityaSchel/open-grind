import { flushSync } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FrameCounter } from "./frame-counter.svelte";

let stop: (() => void) | undefined;

function counting(total: number) {
	let counter!: FrameCounter;
	stop = $effect.root(() => {
		counter = new FrameCounter({ total: () => total });
	});
	flushSync();
	return counter;
}

function nextFrame() {
	vi.advanceTimersToNextFrame();
	flushSync();
}

beforeEach(() => {
	vi.useFakeTimers({
		toFake: ["requestAnimationFrame", "cancelAnimationFrame"],
	});
});

afterEach(() => {
	stop?.();
	stop = undefined;
	vi.useRealTimers();
});

describe("FrameCounter", () => {
	it("starts at one and counts one more per frame up to the total", () => {
		const counter = counting(3);
		expect(counter.count).toBe(1);

		nextFrame();
		expect(counter.count).toBe(2);

		nextFrame();
		expect(counter.count).toBe(3);

		nextFrame();
		expect(counter.count).toBe(3);
		expect(vi.getTimerCount()).toBe(0);
	});

	it("stays at zero with nothing to count", () => {
		expect(counting(0).count).toBe(0);
		expect(vi.getTimerCount()).toBe(0);
	});

	it("stops counting once its owner is destroyed", () => {
		const counter = counting(3);

		stop?.();
		stop = undefined;

		expect(vi.getTimerCount()).toBe(0);
		expect(counter.count).toBe(1);
	});
});
