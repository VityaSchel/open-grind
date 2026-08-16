// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { attachPullInputs } from "./attach-inputs";
import { PullModel } from "./pull-model.svelte";
import { RestingButtonModel } from "./resting-button.svelte";

const PROBE_MS = 120;

function harness() {
	const target = document.createElement("div");
	const restingButton = new RestingButtonModel({ probeMs: PROBE_MS });
	const detach = attachPullInputs(target, {
		model: new PullModel(),
		restingButton,
		position: "bottom",
		boundaryDistance: () => 0,
		overscrollPx: () => 0,
		busy: () => false,
		revealPx: () => 0,
		setRevealPx: () => {},
		setDistance: () => {},
		shouldReveal: () => false,
		shouldConceal: () => false,
	});
	const wheel = (deltaX: number, deltaY: number) =>
		target.dispatchEvent(new WheelEvent("wheel", { deltaX, deltaY }));
	return { restingButton, wheel, detach };
}

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	vi.useRealTimers();
});

describe("the mouse probe at the boundary", () => {
	it("reads a bandless vertical wheel as a pointer", () => {
		const h = harness();

		h.wheel(0, 40);
		vi.advanceTimersByTime(PROBE_MS);

		expect(h.restingButton.pointerOnly).toBe(true);
		h.detach();
	});

	// The swipe gesture cancels its sideways wheels, so their few vertical
	// pixels arrive with no band — the exact signature the probe reads as a
	// mouse, parking a Refresh button after every reply near the floor.
	it("ignores the vertical crumbs of a sideways wheel", () => {
		const h = harness();

		h.wheel(-30, 2);
		h.wheel(-28, 3);
		vi.advanceTimersByTime(PROBE_MS);

		expect(h.restingButton.pointerOnly).toBe(false);
		h.detach();
	});
});
