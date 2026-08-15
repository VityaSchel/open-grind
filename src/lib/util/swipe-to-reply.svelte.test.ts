import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SwipeToReply } from "$lib/util/swipe-to-reply.svelte";

const TRIGGER_DISTANCE_PX = 64;
const WHEEL_TRIGGER_PX = 180;
const WHEEL_REST_MS = 500;

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

function wheelHandler(swipe: SwipeToReply) {
	const { onwheel } = swipe.handlers as {
		onwheel?: (event: WheelEvent) => void;
	};
	if (!onwheel) throw new Error("SwipeToReply exposes no onwheel handler");
	return onwheel;
}

// Positive travel is the fingers moving right; a wheel reports the opposite,
// because its delta points the way the content scrolls.
function flick(
	swipe: SwipeToReply,
	{
		travel,
		cross = 0,
		steps = 8,
		deltaMode = 0,
	}: { travel: number; cross?: number; steps?: number; deltaMode?: number },
): { prevented: number } {
	const onwheel = wheelHandler(swipe);
	const preventDefault = vi.fn();
	for (let step = 0; step < steps; step++)
		onwheel({
			deltaX: -travel / steps,
			deltaY: cross / steps,
			deltaZ: 0,
			deltaMode,
			cancelable: true,
			preventDefault,
		} as unknown as WheelEvent);
	return { prevented: preventDefault.mock.calls.length };
}

describe("SwipeToReply on a trackpad", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("takes horizontal wheel gestures at all", () => {
		const { swipe } = swipeToReply();

		expect(() => wheelHandler(swipe)).not.toThrow();
	});

	it("replies once a two-finger flick accumulates past the trigger", () => {
		const { swipe, onReply } = swipeToReply();

		const { prevented } = flick(swipe, { travel: WHEEL_TRIGGER_PX + 40 });

		expect(onReply).toHaveBeenCalledOnce();
		expect(prevented).toBeGreaterThan(0);
	});

	it("forgets a flick that stopped short once the gesture rests", () => {
		const { swipe, onReply } = swipeToReply();

		flick(swipe, { travel: WHEEL_TRIGGER_PX - 40, steps: 4 });
		expect(onReply).not.toHaveBeenCalled();
		expect(swipe.armed).toBe(false);

		vi.advanceTimersByTime(WHEEL_REST_MS);
		flick(swipe, { travel: WHEEL_TRIGGER_PX - 40, steps: 4 });

		expect(onReply).not.toHaveBeenCalled();
	});

	it("leaves a vertical-dominant wheel to the scroller", () => {
		const { swipe, onReply } = swipeToReply();

		const { prevented } = flick(swipe, {
			travel: WHEEL_TRIGGER_PX + 40,
			cross: 240,
		});

		expect(onReply).not.toHaveBeenCalled();
		expect(prevented).toBe(0);
	});

	it("replies once for a long flick, momentum and all", () => {
		const { swipe, onReply } = swipeToReply();

		flick(swipe, { travel: 900, steps: 40 });

		expect(onReply).toHaveBeenCalledOnce();
	});

	it("replies a second time only after the gesture rests", () => {
		const { swipe, onReply } = swipeToReply();

		flick(swipe, { travel: WHEEL_TRIGGER_PX + 40 });
		flick(swipe, { travel: WHEEL_TRIGGER_PX + 40 });
		expect(onReply).toHaveBeenCalledOnce();

		vi.advanceTimersByTime(WHEEL_REST_MS);
		flick(swipe, { travel: WHEEL_TRIGGER_PX + 40 });

		expect(onReply).toHaveBeenCalledTimes(2);
	});

	it("ignores a mouse wheel, which Chromium also reports in pixels", () => {
		const { swipe, onReply } = swipeToReply();

		const tick = flick(swipe, { travel: 100, steps: 1 });

		expect(onReply).not.toHaveBeenCalled();
		expect(tick.prevented).toBe(0);

		vi.advanceTimersByTime(WHEEL_REST_MS);
		const burst = flick(swipe, { travel: 300, steps: 3 });

		expect(onReply).not.toHaveBeenCalled();
		expect(burst.prevented).toBe(0);
	});

	it("ignores a line-mode wheel, whose one tick would jump the trigger", () => {
		const { swipe, onReply } = swipeToReply();

		const { prevented } = flick(swipe, {
			travel: 300,
			steps: 3,
			deltaMode: 1,
		});

		expect(onReply).not.toHaveBeenCalled();
		expect(prevented).toBe(0);
	});

	it("takes the mirrored flick for an outgoing message", () => {
		const onReply = vi.fn();
		const swipe = new SwipeToReply({ direction: "left", onReply });

		flick(swipe, { travel: WHEEL_TRIGGER_PX + 40 });
		expect(onReply).not.toHaveBeenCalled();

		vi.advanceTimersByTime(WHEEL_REST_MS);
		flick(swipe, { travel: -(WHEEL_TRIGGER_PX + 40) });

		expect(onReply).toHaveBeenCalledOnce();
	});

	it("holds a half-finished flick through a pause, fingers still down", () => {
		const { swipe, onReply } = swipeToReply();

		flick(swipe, { travel: WHEEL_TRIGGER_PX - 40, steps: 6 });
		const held = swipe.deltaX;
		expect(held).toBeGreaterThan(0);

		// a trackpad emits nothing while the fingers rest, and nothing in the
		// platform tells that apart from a lift
		vi.advanceTimersByTime(WHEEL_REST_MS - 100);
		expect(swipe.deltaX).toBe(held);

		flick(swipe, { travel: 80, steps: 4 });
		expect(onReply).toHaveBeenCalledOnce();
	});

	it("gives up on a flick abandoned for good", () => {
		const { swipe, onReply } = swipeToReply();

		flick(swipe, { travel: WHEEL_TRIGGER_PX - 40, steps: 6 });
		vi.advanceTimersByTime(WHEEL_REST_MS + 1);

		expect(onReply).not.toHaveBeenCalled();
		flick(swipe, { travel: 80, steps: 4 });
		expect(onReply).not.toHaveBeenCalled();
	});

	it("needs a far longer flick than a finger drag does", () => {
		const { swipe, onReply } = swipeToReply();

		flick(swipe, { travel: TRIGGER_DISTANCE_PX + 32, steps: 6 });

		expect(onReply).not.toHaveBeenCalled();
	});
});
