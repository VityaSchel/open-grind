// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ScrollGestureState } from "$lib/platform/scroll-gesture";
import { attachPullInputs } from "./attach-inputs";
import { PullModel } from "./pull-model.svelte";
import { makeScrollable } from "./pull-test-helpers";
import { RestingButtonModel } from "./resting-button.svelte";
import type { PullPosition } from "./scroll-chain";

const PROBE_MS = 120;
const FRAME_MS = 16;
const BAND_PX = 6;
const STALE_KEY_MS = 600;

function harness({
	position = "bottom",
	fingerPhase = null,
}: { position?: PullPosition; fingerPhase?: ScrollGestureState | null } = {}) {
	const target = document.createElement("div");
	const row = document.createElement("a");
	const field = document.createElement("input");
	target.append(row, field);
	document.body.append(target);
	const restingButton = new RestingButtonModel({ probeMs: PROBE_MS });
	const towardBoundary = position === "top" ? -1 : 1;
	let distance = 0;
	let bandPx = 0;
	const detachInputs = attachPullInputs(target, {
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
		fingerPhase,
	});
	const wheel = (deltaX: number, deltaY: number) =>
		target.dispatchEvent(new WheelEvent("wheel", { deltaX, deltaY }));
	return {
		restingButton,
		row,
		field,
		wheel,
		detach() {
			detachInputs();
			target.remove();
		},
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
		pressOutsideList(
			key: string,
			{ shiftKey = false }: { shiftKey?: boolean } = {},
		) {
			document.body.dispatchEvent(
				new KeyboardEvent("keydown", { key, shiftKey, bubbles: true }),
			);
		},
		releaseOutsideList(key: string) {
			document.body.dispatchEvent(
				new KeyboardEvent("keyup", { key, bubbles: true }),
			);
		},
		band({
			pulledByWheel,
			after = FRAME_MS,
		}: {
			pulledByWheel: boolean;
			after?: number;
		}) {
			vi.advanceTimersByTime(after);
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
	it("never offers the button when no wheel comes with it", () => {
		const h = harness({ position: "top" });

		h.band({ pulledByWheel: false });

		expect(h.restingButton.offered).toBe(false);
		h.detach();
	});

	it("locks the mouse probe out even when no wheel came with it", () => {
		const h = harness({ position: "top" });
		h.band({ pulledByWheel: false });

		h.wheel(0, -40);
		vi.advanceTimersByTime(PROBE_MS);

		expect(h.restingButton.offered).toBe(false);
		h.detach();
	});

	it("offers the button when a scroll key pressed outside the list drives it", () => {
		const h = harness({ position: "top" });
		h.pressOutsideList("PageUp");

		h.band({ pulledByWheel: false });

		expect(h.restingButton.offered).toBe(true);
		h.detach();
	});

	it("keeps a key's offer through the band that key drives", () => {
		const h = harness({ position: "top" });
		h.press("ArrowUp");

		h.band({ pulledByWheel: false });

		expect(h.restingButton.offered).toBe(true);
		h.detach();
	});

	it("leaves a key typed into a field out of it", () => {
		const h = harness({ position: "top" });
		h.press("ArrowUp", { on: h.field });

		h.band({ pulledByWheel: false });

		expect(h.restingButton.offered).toBe(false);
		h.detach();
	});

	it("leaves a key that scrolls away from the edge out of it", () => {
		const h = harness({ position: "top" });
		h.pressOutsideList("ArrowDown");

		h.band({ pulledByWheel: false });

		expect(h.restingButton.offered).toBe(false);
		h.detach();
	});

	it.each([
		{ position: "top", shiftKey: true },
		{ position: "bottom", shiftKey: false },
	] as const)(
		"counts Space toward the $position edge when Shift is $shiftKey",
		({ position, shiftKey }) => {
			const h = harness({ position });
			h.pressOutsideList(" ", { shiftKey });

			h.band({ pulledByWheel: false });

			expect(h.restingButton.offered).toBe(true);
			h.detach();
		},
	);

	it.each([
		{ position: "top", shiftKey: false },
		{ position: "bottom", shiftKey: true },
	] as const)(
		"leaves Space out of it at the $position edge when Shift is $shiftKey, which scrolls the other way",
		({ position, shiftKey }) => {
			const h = harness({ position });
			h.pressOutsideList(" ", { shiftKey });

			h.band({ pulledByWheel: false });

			expect(h.restingButton.offered).toBe(false);
			h.detach();
		},
	);

	it("counts the release of a scroll key as fresh evidence", () => {
		const h = harness({ position: "top" });
		h.pressOutsideList("ArrowUp");
		vi.advanceTimersByTime(STALE_KEY_MS);
		h.releaseOutsideList("ArrowUp");

		h.band({ pulledByWheel: false });

		expect(h.restingButton.offered).toBe(true);
		h.detach();
	});

	it("takes the offer back at a band that comes once the key press is stale", () => {
		const h = harness({ position: "top" });
		h.press("ArrowUp");
		expect(h.restingButton.offered).toBe(true);

		h.band({ pulledByWheel: false, after: STALE_KEY_MS });

		expect(h.restingButton.offered).toBe(false);
		h.detach();
	});
});

describe("a rubber band at the boundary on macOS", () => {
	it.each(["fingers", "momentum"] as const)(
		"never reads a band that begins in the trackpad's %s phase as key-driven, however fresh the key",
		(state) => {
			const fingerPhase = new ScrollGestureState();
			const h = harness({ position: "top", fingerPhase });
			h.pressOutsideList("PageUp");
			fingerPhase.ingest({ state });

			h.band({ pulledByWheel: false });

			expect(h.restingButton.offered).toBe(false);
			h.detach();
		},
	);

	it("takes a key's offer back at a band that begins under the fingers", () => {
		const fingerPhase = new ScrollGestureState();
		const h = harness({ position: "top", fingerPhase });
		h.press("ArrowUp");
		expect(h.restingButton.offered).toBe(true);
		fingerPhase.ingest({ state: "fingers" });

		h.band({ pulledByWheel: true });

		expect(h.restingButton.offered).toBe(false);
		h.detach();
	});

	it("still offers the button for a key-driven band while no trackpad gesture is under way", () => {
		const fingerPhase = new ScrollGestureState();
		const h = harness({ position: "top", fingerPhase });
		fingerPhase.ingest({ state: "fingers" });
		fingerPhase.ingest({ state: "released" });
		h.pressOutsideList("PageUp");

		h.band({ pulledByWheel: false });

		expect(h.restingButton.offered).toBe(true);
		h.detach();
	});
});
