// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import { MAX_DRAG_PX, SwipeToReply } from "$lib/util/swipe-to-reply.svelte";

const TRIGGER_DISTANCE_PX = 64;
const RAIL_WHEEL_CHAIN_MS = 300;
const RAIL_RELEASE_FALLBACK_MS = 250;

function pointer(overrides: Partial<PointerEvent> = {}) {
	return {
		pointerId: 1,
		pointerType: "touch",
		clientX: 0,
		clientY: 0,
		currentTarget: { setPointerCapture: vi.fn() },
		...overrides,
	} as unknown as PointerEvent;
}

function swipeToReply() {
	const onReply = vi.fn();
	const swipe = new SwipeToReply({ direction: "right", onReply });
	return { swipe, onReply };
}

function drag(
	swipe: SwipeToReply,
	{ x, y = 0 }: { x: number; y?: number },
): void {
	swipe.handlers.onpointerdown?.(pointer() as never);
	swipe.handlers.onpointermove?.(
		pointer({ clientX: x, clientY: y }) as never,
	);
}

describe("SwipeToReply", () => {
	it("replies when a drag past the trigger distance is released", () => {
		const { swipe, onReply } = swipeToReply();

		drag(swipe, { x: TRIGGER_DISTANCE_PX + 20 });
		expect(swipe.armed).toBe(true);
		swipe.handlers.onpointerup?.(pointer() as never);

		expect(onReply).toHaveBeenCalledOnce();
	});

	it("does not reply when the drag stops short", () => {
		const { swipe, onReply } = swipeToReply();

		drag(swipe, { x: TRIGGER_DISTANCE_PX - 20 });
		expect(swipe.armed).toBe(false);
		swipe.handlers.onpointerup?.(pointer() as never);

		expect(onReply).not.toHaveBeenCalled();
	});

	it("does not reply when an armed drag is cancelled", () => {
		const { swipe, onReply } = swipeToReply();

		drag(swipe, { x: TRIGGER_DISTANCE_PX + 20 });
		swipe.handlers.onpointercancel?.(pointer() as never);

		expect(onReply).not.toHaveBeenCalled();
		expect(swipe.armed).toBe(false);
	});

	it("does not reply when capture is lost mid-drag", () => {
		const { swipe, onReply } = swipeToReply();

		drag(swipe, { x: TRIGGER_DISTANCE_PX + 20 });
		swipe.handlers.onlostpointercapture?.(pointer() as never);

		expect(onReply).not.toHaveBeenCalled();
	});

	it("yields to a vertical scroll rather than arming", () => {
		const { swipe, onReply } = swipeToReply();

		drag(swipe, { x: TRIGGER_DISTANCE_PX + 20, y: 40 });
		swipe.handlers.onpointerup?.(pointer() as never);

		expect(swipe.armed).toBe(false);
		expect(onReply).not.toHaveBeenCalled();
	});

	it("ignores a mouse, which would otherwise fight text selection", () => {
		const { swipe, onReply } = swipeToReply();

		swipe.handlers.onpointerdown?.(
			pointer({ pointerType: "mouse" }) as never,
		);
		swipe.handlers.onpointermove?.(
			pointer({ pointerType: "mouse", clientX: 90 }) as never,
		);
		swipe.handlers.onpointerup?.(
			pointer({ pointerType: "mouse" }) as never,
		);

		expect(swipe.deltaX).toBe(0);
		expect(onReply).not.toHaveBeenCalled();
	});

	it("ignores a second finger while one is already dragging", () => {
		const { swipe, onReply } = swipeToReply();

		drag(swipe, { x: TRIGGER_DISTANCE_PX + 20 });
		swipe.handlers.onpointerup?.(pointer({ pointerId: 2 }) as never);

		expect(onReply).not.toHaveBeenCalled();
	});

	it("drags in the opposite direction for an outgoing message", () => {
		const onReply = vi.fn();
		const swipe = new SwipeToReply({ direction: "left", onReply });

		swipe.handlers.onpointerdown?.(pointer() as never);
		swipe.handlers.onpointermove?.(
			pointer({ clientX: -(TRIGGER_DISTANCE_PX + 20) }) as never,
		);
		swipe.handlers.onpointerup?.(pointer() as never);

		expect(onReply).toHaveBeenCalledOnce();
	});
});

function railHarness({
	direction = "right",
	scrollEndSupported = true,
}: { direction?: "left" | "right"; scrollEndSupported?: boolean } = {}) {
	const onReply = vi.fn();
	let time = 0;
	const swipe = new SwipeToReply({
		direction,
		onReply,
		now: () => time,
		scrollEndSupported,
	});
	const rail = document.createElement("div");
	const rest = direction === "right" ? MAX_DRAG_PX : 0;
	const cleanup = swipe.attachRail(rail);
	return {
		swipe,
		onReply,
		rail,
		rest,
		detach: () => {
			if (typeof cleanup === "function") cleanup();
		},
		advance: (ms: number) => {
			time += ms;
		},
		// Fingers stream small wheel deltas while the row's scroller follows;
		// the wheel's delta points the way the content scrolls, which is
		// scrollLeft's own direction.
		swipeBy(px: number, { steps = 6, deltaY = 0, stepMs = 16 } = {}) {
			const sign = direction === "right" ? 1 : -1;
			const target = Math.max(
				0,
				Math.min(MAX_DRAG_PX, rest - (this.dragPx() + px) * sign),
			);
			const perStep = (target - rail.scrollLeft) / steps;
			for (let step = 0; step < steps; step++) {
				this.advance(stepMs);
				rail.dispatchEvent(
					new WheelEvent("wheel", {
						deltaX: perStep,
						deltaY: deltaY / steps,
						deltaMode: 0,
						cancelable: true,
					}),
				);
				rail.scrollLeft += perStep;
				rail.dispatchEvent(new Event("scroll"));
			}
		},
		dragPx() {
			const sign = direction === "right" ? 1 : -1;
			return (rest - rail.scrollLeft) * sign;
		},
		lift() {
			rail.dispatchEvent(new Event("scrollend"));
		},
	};
}

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

		h.swipeBy(MAX_DRAG_PX);
		expect(h.swipe.armed).toBe(true);
		h.swipeBy(-(MAX_DRAG_PX - 20));
		h.lift();

		expect(h.onReply).not.toHaveBeenCalled();
	});

	it("never cancels a wheel, so scrolling and pull-to-refresh stay native", () => {
		const h = railHarness();

		const vertical = new WheelEvent("wheel", {
			deltaX: -2,
			deltaY: 120,
			deltaMode: 0,
			cancelable: true,
		});
		const horizontal = new WheelEvent("wheel", {
			deltaX: -40,
			deltaY: 0,
			deltaMode: 0,
			cancelable: true,
		});
		h.rail.dispatchEvent(vertical);
		h.rail.dispatchEvent(horizontal);

		expect(vertical.defaultPrevented).toBe(false);
		expect(horizontal.defaultPrevented).toBe(false);
	});

	it("does not reply from a lone mouse jump, however far it scrolls", () => {
		const h = railHarness();

		h.swipeBy(MAX_DRAG_PX, { steps: 1 });
		h.lift();

		expect(h.onReply).not.toHaveBeenCalled();
		expect(h.rail.scrollLeft).toBe(h.rest);
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
});
