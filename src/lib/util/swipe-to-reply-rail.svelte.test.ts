// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import { MAX_DRAG_PX } from "$lib/util/swipe-to-reply.svelte";
import {
	pointer,
	RAIL_RELEASE_FALLBACK_MS,
	RAIL_WHEEL_CHAIN_MS,
	railHarness,
	TRIGGER_DISTANCE_PX,
} from "./swipe-to-reply-test-helpers";

describe("SwipeToReply on a trackpad", () => {
	it("rests the row against its spacer so there is room to drag", () => {
		const incoming = railHarness({ direction: "right" });
		const outgoing = railHarness({ direction: "left" });

		expect(incoming.rail.scrollLeft).toBe(MAX_DRAG_PX);
		expect(outgoing.rail.scrollLeft).toBe(0);
	});

	it("replies when a drag past the trigger is lifted", () => {
		const h = railHarness();

		h.swipeBy(TRIGGER_DISTANCE_PX + 16);
		expect(h.swipe.armed).toBe(true);
		expect(h.swipe.progress).toBe(1);
		expect(h.onReply).not.toHaveBeenCalled();

		h.lift();

		expect(h.onReply).toHaveBeenCalledOnce();
	});

	it("holds a paused drag for as long as the fingers stay down", () => {
		vi.useFakeTimers();
		try {
			const h = railHarness();

			h.swipeBy(TRIGGER_DISTANCE_PX + 16);
			const held = h.swipe.progress;

			// resting fingers emit nothing, and only the lift may release
			h.advance(600_000);
			vi.advanceTimersByTime(600_000);

			expect(h.swipe.progress).toBe(held);
			expect(h.swipe.armed).toBe(true);
			expect(h.onReply).not.toHaveBeenCalled();

			h.lift();
			expect(h.onReply).toHaveBeenCalledOnce();
		} finally {
			vi.useRealTimers();
		}
	});

	it("returns to rest without replying when lifted short of the trigger", () => {
		const h = railHarness();

		h.swipeBy(TRIGGER_DISTANCE_PX - 24);
		h.lift();

		expect(h.onReply).not.toHaveBeenCalled();
		expect(h.rail.scrollLeft).toBe(h.rest);
		expect(h.swipe.armed).toBe(false);
	});

	it("does not reply when an armed drag eases back before the lift", () => {
		const h = railHarness();

		h.swipeBy(TRIGGER_DISTANCE_PX + 16);
		expect(h.swipe.armed).toBe(true);
		h.swipeBy(-(TRIGGER_DISTANCE_PX - 20));
		h.lift();

		expect(h.onReply).not.toHaveBeenCalled();
	});

	it("stays pinned at full stretch until the fingers release", () => {
		const h = railHarness();

		h.swipeBy(MAX_DRAG_PX);

		expect(h.onReply).not.toHaveBeenCalled();
		expect(h.swipe.armed).toBe(true);

		h.lift();

		expect(h.onReply).toHaveBeenCalledOnce();
	});

	it("commits nothing before the release, momentum tail or not", () => {
		const h = railHarness();

		h.swipeBy(MAX_DRAG_PX);
		h.momentumTail();

		expect(h.onReply).not.toHaveBeenCalled();
		expect(h.swipe.armed).toBe(true);

		h.lift();

		expect(h.onReply).toHaveBeenCalledOnce();
	});

	it("evaluates a full there-and-back sweep exactly once, at its release", () => {
		const h = railHarness();

		h.swipeBy(MAX_DRAG_PX);
		h.swipeBy(-MAX_DRAG_PX);

		expect(h.onReply).not.toHaveBeenCalled();

		h.lift();

		// back at rest by its own hand: nothing to commit, nothing to repeat
		expect(h.onReply).not.toHaveBeenCalled();
		expect(h.rail.scrollLeft).toBe(h.rest);
	});

	it("keeps a jittering hold at full stretch from reading as a lift", () => {
		const h = railHarness();

		h.swipeBy(MAX_DRAG_PX);
		for (let index = 0; index < 12; index++) {
			h.advance(16);
			h.rail.dispatchEvent(
				new WheelEvent("wheel", {
					deltaX: index % 2 === 0 ? -9 : -3,
					deltaY: 0,
					deltaMode: 0,
				}),
			);
		}

		expect(h.onReply).not.toHaveBeenCalled();

		h.lift();

		expect(h.onReply).toHaveBeenCalledOnce();
	});

	it("swallows the momentum that outlives a committing release", () => {
		const h = railHarness();

		h.swipeBy(TRIGGER_DISTANCE_PX + 16);
		h.lift();
		expect(h.onReply).toHaveBeenCalledOnce();

		h.advance(16);
		const tail = new WheelEvent("wheel", {
			deltaX: -20,
			deltaY: 0,
			deltaMode: 0,
			cancelable: true,
		});
		h.rail.dispatchEvent(tail);

		expect(tail.defaultPrevented).toBe(true);
		expect(h.onReply).toHaveBeenCalledOnce();
	});

	it("swallows momentum even when the release commits nothing", () => {
		const h = railHarness();

		h.swipeBy(TRIGGER_DISTANCE_PX - 24);
		h.lift();

		h.advance(16);
		const tail = new WheelEvent("wheel", {
			deltaX: -20,
			deltaY: 0,
			deltaMode: 0,
			cancelable: true,
		});
		h.rail.dispatchEvent(tail);

		expect(tail.defaultPrevented).toBe(true);
		expect(h.onReply).not.toHaveBeenCalled();
	});

	it("never cancels a wheel that vertical scrolling may need", () => {
		const h = railHarness();

		const vertical = new WheelEvent("wheel", {
			deltaX: -2,
			deltaY: 120,
			deltaMode: 0,
			cancelable: true,
		});
		const heave = new WheelEvent("wheel", {
			deltaX: -30,
			deltaY: -200,
			deltaMode: 0,
			cancelable: true,
		});
		const fingers = new WheelEvent("wheel", {
			deltaX: -40,
			deltaY: 0,
			deltaMode: 0,
			cancelable: true,
		});
		h.rail.dispatchEvent(vertical);
		h.rail.dispatchEvent(heave);
		h.rail.dispatchEvent(fingers);

		expect(vertical.defaultPrevented).toBe(false);
		expect(heave.defaultPrevented).toBe(false);
		expect(fingers.defaultPrevented).toBe(false);
	});

	it("suppresses a mouse's sideways jump before it can move the row", () => {
		const h = railHarness();

		const jump = new WheelEvent("wheel", {
			deltaX: -160,
			deltaY: 0,
			deltaMode: 0,
			cancelable: true,
		});
		h.rail.dispatchEvent(jump);

		expect(jump.defaultPrevented).toBe(true);
		expect(h.rail.scrollLeft).toBe(h.rest);

		// even an engine that scrolled it anyway must not see a reply
		h.rail.scrollLeft = h.rest - MAX_DRAG_PX * (h.rest === 0 ? -1 : 1);
		h.rail.dispatchEvent(new Event("scroll"));
		h.lift();

		expect(h.onReply).not.toHaveBeenCalled();
	});

	it("forgets wheel steps once the chain window lapses", () => {
		const h = railHarness();

		h.swipeBy(8, { steps: 2 });
		h.advance(RAIL_WHEEL_CHAIN_MS + 1);
		h.swipeBy(MAX_DRAG_PX, { steps: 1 });
		h.lift();

		expect(h.onReply).not.toHaveBeenCalled();
	});

	it("does not let vertical wheels vouch for a mouse jump", () => {
		const h = railHarness();

		for (let step = 0; step < 5; step++) {
			h.advance(16);
			h.rail.dispatchEvent(
				new WheelEvent("wheel", {
					deltaX: 0,
					deltaY: -40,
					deltaMode: 0,
				}),
			);
		}
		h.swipeBy(MAX_DRAG_PX, { steps: 2 });
		h.lift();

		expect(h.onReply).not.toHaveBeenCalled();
	});

	it("replies again on the next distinct gesture", () => {
		const h = railHarness();

		h.swipeBy(TRIGGER_DISTANCE_PX + 16);
		h.lift();
		h.advance(RAIL_WHEEL_CHAIN_MS + 1);
		h.swipeBy(TRIGGER_DISTANCE_PX + 16);
		h.lift();

		expect(h.onReply).toHaveBeenCalledTimes(2);
	});

	it("takes the mirrored drag for an outgoing message", () => {
		const h = railHarness({ direction: "left" });

		h.swipeBy(TRIGGER_DISTANCE_PX + 16);
		expect(h.rail.scrollLeft).toBeGreaterThan(TRIGGER_DISTANCE_PX);
		h.lift();

		expect(h.onReply).toHaveBeenCalledOnce();
	});

	it("falls back to a quiet gap where scrollend does not exist", () => {
		vi.useFakeTimers();
		try {
			const h = railHarness({ scrollEndSupported: false });

			h.swipeBy(TRIGGER_DISTANCE_PX + 16);
			expect(h.onReply).not.toHaveBeenCalled();

			vi.advanceTimersByTime(RAIL_RELEASE_FALLBACK_MS);

			expect(h.onReply).toHaveBeenCalledOnce();
			expect(h.rail.scrollLeft).toBe(h.rest);
		} finally {
			vi.useRealTimers();
		}
	});

	it("cancels, never commits, a held wheel drag that a touch interrupts", () => {
		const h = railHarness();

		h.swipeBy(TRIGGER_DISTANCE_PX + 16);
		h.swipe.handlers.onpointerdown?.(pointer() as never);

		expect(h.onReply).not.toHaveBeenCalled();
		expect(h.rail.scrollLeft).toBe(h.rest);
	});

	it("stops listening once detached", () => {
		const h = railHarness();

		h.detach();
		h.swipeBy(MAX_DRAG_PX);
		h.lift();

		expect(h.onReply).not.toHaveBeenCalled();
	});
	it("announces the arm once while the fingers hold past the trigger", () => {
		const h = railHarness();

		h.swipeBy(TRIGGER_DISTANCE_PX + 10);
		expect(h.onArm).toHaveBeenCalledOnce();

		h.swipeBy(10);

		expect(h.onArm).toHaveBeenCalledOnce();
	});

	it("announces nothing when momentum re-drags the row after the lift", () => {
		const h = railHarness();

		h.swipeBy(TRIGGER_DISTANCE_PX + 10);
		h.lift();
		h.onArm.mockClear();
		h.momentumTail();
		h.rail.scrollLeft = h.rest - (TRIGGER_DISTANCE_PX + 20);
		h.rail.dispatchEvent(new Event("scroll"));

		expect(h.onArm).not.toHaveBeenCalled();
	});

	it("announces nothing when the lift itself replies", () => {
		const h = railHarness();

		h.swipeBy(TRIGGER_DISTANCE_PX + 10);
		h.onArm.mockClear();
		h.lift();

		expect(h.onReply).toHaveBeenCalledOnce();
		expect(h.onArm).not.toHaveBeenCalled();
	});
});
