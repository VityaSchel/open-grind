// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import { SwipeToReply } from "$lib/util/swipe-to-reply.svelte";
import {
	drag,
	pointer,
	swipeToReply,
	TRIGGER_DISTANCE_PX,
} from "./swipe-to-reply-test-helpers";

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
	it("announces the arm once as the drag crosses the trigger", () => {
		const { swipe, onArm } = swipeToReply();

		drag(swipe, { x: TRIGGER_DISTANCE_PX + 4 });
		expect(onArm).toHaveBeenCalledOnce();

		swipe.handlers.onpointermove?.(
			pointer({ clientX: TRIGGER_DISTANCE_PX + 20 }) as never,
		);

		expect(onArm).toHaveBeenCalledOnce();
	});

	it("does not announce again while one drag wanders back across the trigger", () => {
		const { swipe, onArm } = swipeToReply();

		drag(swipe, { x: TRIGGER_DISTANCE_PX + 20 });
		swipe.handlers.onpointermove?.(
			pointer({ clientX: TRIGGER_DISTANCE_PX - 20 }) as never,
		);
		swipe.handlers.onpointermove?.(
			pointer({ clientX: TRIGGER_DISTANCE_PX + 20 }) as never,
		);

		expect(onArm).toHaveBeenCalledOnce();
	});

	it("announces again once the drag has been taken back to rest", () => {
		const { swipe, onArm } = swipeToReply();

		drag(swipe, { x: TRIGGER_DISTANCE_PX + 20 });
		swipe.handlers.onpointermove?.(pointer({ clientX: 0 }) as never);
		swipe.handlers.onpointermove?.(
			pointer({ clientX: TRIGGER_DISTANCE_PX + 20 }) as never,
		);

		expect(onArm).toHaveBeenCalledTimes(2);
	});

	it("announces nothing when a drag is released or cancelled", () => {
		const replying = swipeToReply();
		drag(replying.swipe, { x: TRIGGER_DISTANCE_PX + 20 });
		replying.onArm.mockClear();
		replying.swipe.handlers.onpointerup?.(pointer() as never);
		expect(replying.onArm).not.toHaveBeenCalled();

		const cancelled = swipeToReply();
		drag(cancelled.swipe, { x: TRIGGER_DISTANCE_PX + 20 });
		cancelled.onArm.mockClear();
		cancelled.swipe.handlers.onpointercancel?.(pointer() as never);
		expect(cancelled.onArm).not.toHaveBeenCalled();
	});

	it("announces nothing for a drag that stops short of the trigger", () => {
		const { swipe, onArm } = swipeToReply();

		drag(swipe, { x: TRIGGER_DISTANCE_PX - 4 });
		swipe.handlers.onpointerup?.(pointer() as never);

		expect(onArm).not.toHaveBeenCalled();
	});
});
