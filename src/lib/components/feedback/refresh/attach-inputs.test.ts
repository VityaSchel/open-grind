// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ScrollGestureState } from "#lib/platform/scroll-gesture.ts";
import { resetPlatform, runningOn } from "#lib/test/platform.ts";
import { attachPullInputs } from "./attach-inputs";
import { PullModel } from "./pull-model.svelte";
import { makeScrollable, touchEvent } from "./pull-test-helpers";
import { RestingButtonModel } from "./resting-button.svelte";
import type { PullPosition } from "./scroll-chain";

const PROBE_MS = 120;
const FRAME_MS = 16;
const BAND_PX = 6;
const STALE_KEY_MS = 600;
const TRACKPAD_TAIL_MS = 100;

function harness({
	position = "bottom",
	fingerPhase = null,
	pullFromNativeBand = false,
}: {
	position?: PullPosition;
	fingerPhase?: ScrollGestureState | null;
	pullFromNativeBand?: boolean;
} = {}) {
	const target = document.createElement("div");
	const row = document.createElement("a");
	const field = document.createElement("input");
	target.append(row, field);
	document.body.append(target);
	const restingButton = new RestingButtonModel({ probeMs: PROBE_MS });
	const model = new PullModel();
	const towardBoundary = position === "top" ? -1 : 1;
	let distance = 0;
	let bandPx = 0;
	const detachInputs = attachPullInputs(target, {
		model,
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
		nativeBand: true,
		pullFromNativeBand,
	});
	const wheel = (deltaX: number, deltaY: number) =>
		target.dispatchEvent(new WheelEvent("wheel", { deltaX, deltaY }));
	return {
		model,
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
		endBand() {
			target.dispatchEvent(new Event("scrollend"));
		},
		dragFinger(dy: number) {
			row.dispatchEvent(touchEvent("touchstart", { y: 100 }));
			row.dispatchEvent(touchEvent("touchmove", { y: 100 + dy }));
		},
		touchRow() {
			row.dispatchEvent(touchEvent("touchstart"));
		},
		liftFinger() {
			row.dispatchEvent(touchEvent("touchend"));
		},
	};
}

beforeEach(() => {
	vi.useFakeTimers();
	runningOn("windows");
});

afterEach(() => {
	vi.useRealTimers();
	resetPlatform();
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

	it.each([
		{ deltaX: 1, deltaY: 1 },
		{ deltaX: -1, deltaY: 1 },
		{ deltaX: 30, deltaY: 30 },
	])(
		"ignores a wheel that is exactly diagonal at $deltaX by $deltaY",
		({ deltaX, deltaY }) => {
			const h = harness();

			h.wheel(deltaX, deltaY);
			vi.advanceTimersByTime(PROBE_MS);

			expect(h.restingButton.offered).toBe(false);
			h.detach();
		},
	);

	it("still reads a wheel that is barely more vertical than sideways as a pointer", () => {
		const h = harness();

		h.wheel(3, 4);
		vi.advanceTimersByTime(PROBE_MS);

		expect(h.restingButton.offered).toBe(true);
		h.detach();
	});
});

describe("the mouse probe at the boundary on macOS", () => {
	it.each(["fingers", "momentum"] as const)(
		"ignores a vertical wheel that arrives in the trackpad's %s phase",
		(state) => {
			const fingerPhase = new ScrollGestureState();
			const h = harness({ fingerPhase });
			fingerPhase.ingest({ state });

			h.wheel(0, 40);
			vi.advanceTimersByTime(PROBE_MS);

			expect(h.restingButton.offered).toBe(false);
			h.detach();
		},
	);

	it.each(["fingers", "momentum"] as const)(
		"cancels a probe that a wheel armed just before the trackpad's %s phase arrives",
		(state) => {
			const fingerPhase = new ScrollGestureState();
			const h = harness({ fingerPhase });

			h.wheel(0, 40);
			vi.advanceTimersByTime(PROBE_MS - 1);
			fingerPhase.ingest({ state });
			vi.advanceTimersByTime(PROBE_MS);

			expect(h.restingButton.offered).toBe(false);
			h.detach();
		},
	);

	it("ignores the last momentum wheel, which lands just after the trackpad reports idle", () => {
		const fingerPhase = new ScrollGestureState();
		const h = harness({ fingerPhase });
		fingerPhase.ingest({ state: "momentum" });
		fingerPhase.ingest({ state: "idle" });

		vi.advanceTimersByTime(3);
		h.wheel(0, 14);
		vi.advanceTimersByTime(PROBE_MS);

		expect(h.restingButton.offered).toBe(false);
		h.detach();
	});

	it("reads a bandless wheel as a pointer again once the trackpad gesture has died out", () => {
		const fingerPhase = new ScrollGestureState();
		const h = harness({ fingerPhase });
		fingerPhase.ingest({ state: "momentum" });
		fingerPhase.ingest({ state: "idle" });

		vi.advanceTimersByTime(TRACKPAD_TAIL_MS);
		h.wheel(0, 40);
		vi.advanceTimersByTime(PROBE_MS);

		expect(h.restingButton.offered).toBe(true);
		h.detach();
	});

	it("still reads a bandless mouse wheel, which has no phases, as a pointer", () => {
		const h = harness({ fingerPhase: new ScrollGestureState() });

		h.wheel(0, 40);
		vi.advanceTimersByTime(PROBE_MS);

		expect(h.restingButton.offered).toBe(true);
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
		vi.advanceTimersByTime(TRACKPAD_TAIL_MS);
		h.pressOutsideList("PageUp");

		h.band({ pulledByWheel: false });

		expect(h.restingButton.offered).toBe(true);
		h.detach();
	});
});

describe("the pull inputs on iOS", () => {
	beforeEach(() => {
		runningOn("ios");
	});

	it("reads a pull from the rubber band under a finger and refreshes on lift", () => {
		const h = harness({ position: "top", pullFromNativeBand: true });
		const refreshed = vi.fn();
		h.model.space = BAND_PX;
		h.model.onTrigger = refreshed;

		h.touchRow();
		h.band({ pulledByWheel: false });
		expect(h.model.source).toBe("band");
		expect(h.model.phase).toBe("armed");
		h.liftFinger();

		expect(refreshed).toHaveBeenCalledOnce();
		h.detach();
	});

	it("leaves a band without a finger alone, even when it ends with scrollend", () => {
		const h = harness({ position: "top", pullFromNativeBand: true });

		h.band({ pulledByWheel: false });
		h.endBand();

		expect(h.model.phase).toBe("idle");
		expect(h.model.settledFrom).toBeNull();
		h.detach();
	});

	it("never starts a pull from the finger's own travel at the boundary", () => {
		const h = harness({ position: "top", pullFromNativeBand: true });

		h.dragFinger(120);

		expect(h.model.phase).toBe("idle");
		h.detach();
	});

	it("elsewhere still starts a touch pull from the finger's travel at the boundary", () => {
		const h = harness({ position: "top" });

		h.dragFinger(120);

		expect(h.model.source).toBe("touch");
		h.detach();
	});
});

describe("a pull from a no-pull area", () => {
	function touchPullFromNoPullArea() {
		const h = harness({ position: "top" });
		h.row.setAttribute("data-refresh-no-pull", "");
		h.dragFinger(120);
		const pulledFrom = h.model.source;
		h.detach();
		return pulledFrom;
	}

	function bandPullFromNoPullArea() {
		const h = harness({ position: "top", pullFromNativeBand: true });
		h.model.space = BAND_PX;
		h.row.setAttribute("data-refresh-no-pull", "");
		h.touchRow();
		h.band({ pulledByWheel: false });
		const pulledFrom = h.model.source;
		h.liftFinger();
		h.detach();
		return pulledFrom;
	}

	it("is refused under a finger on android", () => {
		runningOn("android");

		expect(touchPullFromNoPullArea()).toBeNull();
	});

	it("is refused from the rubber band on ios", () => {
		runningOn("ios");

		expect(bandPullFromNoPullArea()).toBeNull();
	});

	it.each(["linux", "macos", "windows"] as const)(
		"still pulls on %s",
		(platform) => {
			runningOn(platform);

			expect(touchPullFromNoPullArea()).toBe("touch");
			expect(bandPullFromNoPullArea()).toBe("band");
		},
	);
});
