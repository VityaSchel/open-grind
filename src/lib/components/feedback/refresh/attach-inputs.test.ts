// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { attachPullInputs } from "./attach-inputs";
import { PullModel } from "./pull-model.svelte";
import { makeScrollable } from "./pull-test-helpers";
import { RestingButtonModel } from "./resting-button.svelte";
import type { PullPosition } from "./scroll-chain";

const PROBE_MS = 120;
const FRAME_MS = 16;
const BAND_PX = 6;

function harness({ position = "bottom" }: { position?: PullPosition } = {}) {
	const target = document.createElement("div");
	const row = document.createElement("a");
	const field = document.createElement("input");
	target.append(row, field);
	const restingButton = new RestingButtonModel({ probeMs: PROBE_MS });
	const towardBoundary = position === "top" ? -1 : 1;
	let distance = 0;
	let bandPx = 0;
	const detach = attachPullInputs(target, {
		model: new PullModel(),
		restingButton,
		position,
		boundaryDistance: () => distance,
		overscrollPx: () => bandPx,
		busy: () => false,
		revealPx: () => 0,
		setRevealPx: () => {},
		setDistance: () => {},
		shouldReveal: () => false,
		shouldConceal: () => false,
	});
	const wheel = (deltaX: number, deltaY: number) =>
		target.dispatchEvent(new WheelEvent("wheel", { deltaX, deltaY }));
	return {
		restingButton,
		row,
		field,
		wheel,
		detach,
		scrollAwayFromBoundary() {
			distance = 40;
		},
		press(key: string, { on = row }: { on?: HTMLElement } = {}) {
			on.dispatchEvent(
				new KeyboardEvent("keydown", {
					key,
					bubbles: true,
					cancelable: true,
				}),
			);
		},
		band({ pulledByWheel }: { pulledByWheel: boolean }) {
			vi.advanceTimersByTime(FRAME_MS);
			if (pulledByWheel) wheel(0, 4 * towardBoundary);
			bandPx = BAND_PX;
			target.dispatchEvent(new Event("scroll"));
		},
	};
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

		expect(h.restingButton.offered).toBe(true);
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

		expect(h.restingButton.offered).toBe(false);
		h.detach();
	});
});

describe("a scroll key pressed inside the list", () => {
	it.each([
		{ position: "top", key: "ArrowUp" },
		{ position: "top", key: "PageUp" },
		{ position: "top", key: "Home" },
		{ position: "bottom", key: "ArrowDown" },
		{ position: "bottom", key: "PageDown" },
		{ position: "bottom", key: "End" },
	] as const)(
		"offers the button for $key at the $position edge the list already rests at",
		({ position, key }) => {
			const h = harness({ position });

			h.press(key);

			expect(h.restingButton.offered).toBe(true);
			h.detach();
		},
	);

	it.each([
		{ position: "top", key: "ArrowDown" },
		{ position: "bottom", key: "ArrowUp" },
		{ position: "bottom", key: "Enter" },
	] as const)(
		"offers nothing for $key at the $position edge, which does not scroll toward it",
		({ position, key }) => {
			const h = harness({ position });

			h.press(key);

			expect(h.restingButton.offered).toBe(false);
			h.detach();
		},
	);

	it("offers nothing while the key still has list left to scroll", () => {
		const h = harness({ position: "top" });
		h.scrollAwayFromBoundary();

		h.press("ArrowUp");

		expect(h.restingButton.offered).toBe(false);
		h.detach();
	});

	it("leaves a key typed into a field to the field", () => {
		const h = harness({ position: "top" });

		h.press("ArrowUp", { on: h.field });

		expect(h.restingButton.offered).toBe(false);
		h.detach();
	});

	it("leaves a key to a nested scroller that can still scroll toward the edge", () => {
		const h = harness({ position: "top" });
		const nested = document.createElement("div");
		makeScrollable(nested, { scrollTop: 50 });
		h.row.before(nested);
		nested.append(h.row);

		h.press("ArrowUp");

		expect(h.restingButton.offered).toBe(false);
		h.detach();
	});

	it("leaves a key alone that a control in the list already handled", () => {
		const h = harness({ position: "top" });
		h.row.addEventListener("keydown", (event) => event.preventDefault());

		h.press("ArrowUp");

		expect(h.restingButton.offered).toBe(false);
		h.detach();
	});
});

describe("a rubber band at the boundary", () => {
	it("offers the button when no wheel and no touch drives it", () => {
		const h = harness({ position: "top" });

		h.band({ pulledByWheel: false });

		expect(h.restingButton.offered).toBe(true);
		h.detach();
	});

	it("takes the offer back once a wheel pulls it", () => {
		const h = harness({ position: "top" });
		h.press("ArrowUp");
		expect(h.restingButton.offered).toBe(true);

		h.band({ pulledByWheel: true });

		expect(h.restingButton.offered).toBe(false);
		h.detach();
	});
});
