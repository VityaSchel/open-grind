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
		// scrollLeft's own direction. The deltas alternate fat and thin the
		// way real fingers jitter, so a swipe never reads as a momentum tail.
		swipeBy(px: number, { steps = 6, deltaY = 0, stepMs = 16 } = {}) {
			const sign = direction === "right" ? 1 : -1;
			const target = Math.max(
				0,
				Math.min(MAX_DRAG_PX, rest - (this.dragPx() + px) * sign),
			);
			let remaining = target - rail.scrollLeft;
			for (let step = 0; step < steps; step++) {
				const even = (remaining / (steps - step)) * 1.25;
				const delta =
					step === steps - 1
						? remaining
						: even * (step % 2 === 0 ? 1 : 0.6);
				this.advance(stepMs);
				rail.dispatchEvent(
					new WheelEvent("wheel", {
						deltaX: delta,
						deltaY: deltaY / steps,
						deltaMode: 0,
						cancelable: true,
					}),
				);
				rail.scrollLeft += delta;
				remaining -= delta;
				rail.dispatchEvent(new Event("scroll"));
			}
		},
		// a flick's tail: fingers already gone, magnitudes only ever decaying
		momentumTail({ events = 8, startPx = 40 } = {}) {
			const sign = direction === "right" ? -1 : 1;
			for (let index = 0; index < events; index++) {
				this.advance(16);
				rail.dispatchEvent(
					new WheelEvent("wheel", {
						deltaX: startPx * 0.8 ** index * sign,
						deltaY: 0,
						deltaMode: 0,
						cancelable: true,
					}),
				);
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
});
