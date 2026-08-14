import { describe, expect, it, vi } from "vitest";

import { SwipeToReply } from "$lib/util/swipe-to-reply.svelte";

const TRIGGER_DISTANCE_PX = 64;

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
