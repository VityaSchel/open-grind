// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import { MAX_DRAG_PX } from "$lib/util/swipe-to-reply.svelte";
import {
	bridgeHarness,
	TRIGGER_DISTANCE_PX,
} from "./swipe-to-reply-test-helpers";

describe("SwipeToReply over the gesture-phase bridge", () => {
	it("replies the instant the fingers release past the trigger", () => {
		const h = bridgeHarness();

		h.fingers();
		h.wheel(TRIGGER_DISTANCE_PX + 16);
		expect(h.swipe.armed).toBe(true);
		expect(h.onReply).not.toHaveBeenCalled();

		h.release();

		expect(h.onReply).toHaveBeenCalledOnce();
		expect(h.swipe.armed).toBe(false);
	});

	it("aborts a release short of the trigger", () => {
		const h = bridgeHarness();

		h.fingers();
		h.wheel(TRIGGER_DISTANCE_PX - 24);
		h.release();

		expect(h.onReply).not.toHaveBeenCalled();
	});

	it("moves at the pace of the native deltas, not the webview's hotter ones", () => {
		const h = bridgeHarness();

		h.fingers();
		h.wheel(TRIGGER_DISTANCE_PX - 24, 0, { domScale: 1.75 });

		expect(Math.abs(h.swipe.deltaX)).toBe(TRIGGER_DISTANCE_PX - 24);
	});

	it("locks a diagonal drag to the reply and captures the gesture", () => {
		const h = bridgeHarness();
		const capture = vi.spyOn(h.gesture, "capture");

		h.fingers();
		const opening = h.wheel(
			TRIGGER_DISTANCE_PX + 16,
			TRIGGER_DISTANCE_PX + 16,
		);

		expect(h.swipe.armed).toBe(true);
		// nothing is ever cancelled: WebKit degrades gestures over
		// non-passive wheel regions, freezing the overscroll band
		expect(opening.cancelled).not.toContain(true);
		// the monitor swallows the rest of the gesture instead, so the
		// conversation cannot double-scroll or twitch under a reply drag
		expect(capture).toHaveBeenCalledWith(true);

		h.release();
		expect(h.onReply).toHaveBeenCalledOnce();
		expect(capture).toHaveBeenLastCalledWith(false);
	});

	it("never captures a scroll-locked gesture", () => {
		const h = bridgeHarness();
		const capture = vi.spyOn(h.gesture, "capture");

		h.fingers();
		h.wheel(4, 200);
		h.release();

		expect(capture).not.toHaveBeenCalledWith(true);
	});

	it("locks a drifting vertical push to scrolling, not the reply", () => {
		const h = bridgeHarness();

		h.fingers();
		// sideways drift outruns any single threshold, but never dominates
		const drift = h.wheel(24, 32);

		expect(drift.cancelled).not.toContain(true);
		expect(h.swipe.deltaX).toBe(0);

		h.release();

		expect(h.onReply).not.toHaveBeenCalled();
	});

	it("locks a vertical scroll to scrolling for its whole gesture", () => {
		const h = bridgeHarness();

		h.fingers();
		const vertical = h.wheel(4, 200);
		expect(vertical.cancelled).not.toContain(true);
		expect(h.swipe.deltaX).toBe(0);

		// the same gesture wandering sideways later must not grab the row,
		// however far it wanders
		const wander = h.wheel(MAX_DRAG_PX * 3);
		expect(wander.cancelled).not.toContain(true);
		expect(h.swipe.deltaX).toBe(0);

		h.release();

		expect(h.onReply).not.toHaveBeenCalled();
	});

	it("never lets momentum drag the row, before or after a release", () => {
		const h = bridgeHarness();

		h.fingers();
		h.wheel(TRIGGER_DISTANCE_PX + 16);
		h.release();
		expect(h.onReply).toHaveBeenCalledOnce();

		// the row is springing home; the tail must not re-grow the drag
		const returning = Math.abs(h.swipe.deltaX);
		h.momentum();
		h.wheel(MAX_DRAG_PX);

		expect(Math.abs(h.swipe.deltaX)).toBeLessThanOrEqual(returning);
		expect(h.swipe.armed).toBe(false);
		expect(h.onReply).toHaveBeenCalledOnce();
	});

	it("ignores a mouse, whose wheels carry no finger phase", () => {
		const h = bridgeHarness();

		h.wheel(MAX_DRAG_PX);

		expect(h.swipe.deltaX).toBe(0);
		expect(h.swipe.armed).toBe(false);
	});

	it("never drags away from the reply direction", () => {
		const h = bridgeHarness();

		h.fingers();
		h.wheel(-MAX_DRAG_PX);

		expect(h.swipe.deltaX).toBe(0);

		h.release();

		expect(h.onReply).not.toHaveBeenCalled();
	});

	it("takes the mirrored drag for an outgoing message", () => {
		const h = bridgeHarness({ direction: "left" });

		h.fingers();
		h.wheel(TRIGGER_DISTANCE_PX + 16);
		h.release();

		expect(h.onReply).toHaveBeenCalledOnce();
	});

	it("stops listening once detached", () => {
		const h = bridgeHarness();

		h.detach();
		h.fingers();
		h.wheel(MAX_DRAG_PX);
		h.release();

		expect(h.onReply).not.toHaveBeenCalled();
	});

	it("announces the arm once while the fingers stay past the trigger", () => {
		const h = bridgeHarness();

		h.fingers();
		h.wheel(TRIGGER_DISTANCE_PX + 16);
		expect(h.onArm).toHaveBeenCalledOnce();

		h.wheel(8);

		expect(h.onArm).toHaveBeenCalledOnce();
	});

	it("announces nothing on release", () => {
		const h = bridgeHarness();

		h.fingers();
		h.wheel(TRIGGER_DISTANCE_PX + 16);
		h.onArm.mockClear();
		h.release();

		expect(h.onReply).toHaveBeenCalledOnce();
		expect(h.onArm).not.toHaveBeenCalled();
	});

	it("announces nothing for a gesture that locked to scrolling", () => {
		const h = bridgeHarness();

		h.fingers();
		h.wheel(0, MAX_DRAG_PX * 2);
		h.release();

		expect(h.onArm).not.toHaveBeenCalled();
	});
});
