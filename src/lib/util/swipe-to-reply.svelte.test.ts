// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

import { SwipeToReply, wheelInputMode } from "$lib/util/swipe-to-reply.svelte";
import {
	drag,
	pointer,
	swipeToReply,
	touchOnlyHarness,
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

	it("eases the row back instead of jumping on release", () => {
		const { swipe } = swipeToReply();

		drag(swipe, { x: 40 });
		swipe.handlers.onpointerup?.(pointer() as never);

		expect(swipe.deltaX).toBe(40);
	});

	it("puts the row straight back under reduced motion", () => {
		const { swipe } = swipeToReply({ reducedMotion: true });

		drag(swipe, { x: 40 });
		swipe.handlers.onpointerup?.(pointer() as never);

		expect(swipe.deltaX).toBe(0);
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

describe("wheelInputMode", () => {
	const tauri = globalThis as {
		isTauri?: boolean;
		__TAURI_OS_PLUGIN_INTERNALS__?: { platform: string };
	};

	function runningOn(platform: string) {
		tauri.isTauri = true;
		tauri.__TAURI_OS_PLUGIN_INTERNALS__ = { platform };
	}

	afterEach(() => {
		delete tauri.isTauri;
		delete tauri.__TAURI_OS_PLUGIN_INTERNALS__;
	});

	it("takes no wheel input where fingers are the only pointer", () => {
		runningOn("android");
		expect(wheelInputMode()).toBe("none");

		runningOn("ios");
		expect(wheelInputMode()).toBe("none");
	});

	it("keeps the bridge on macOS and the rail on every other desktop", () => {
		runningOn("macos");
		expect(wheelInputMode()).toBe("bridge");

		runningOn("linux");
		expect(wheelInputMode()).toBe("rail");

		runningOn("windows");
		expect(wheelInputMode()).toBe("rail");
	});

	it("keeps the rail in a plain browser", () => {
		expect(wheelInputMode()).toBe("rail");
	});
});

describe("SwipeToReply without a wheel path", () => {
	it("leaves the row unscrolled and unlistened", () => {
		const { row, listen, cleanup } = touchOnlyHarness();

		expect(row.scrollLeft).toBe(0);
		expect(listen).not.toHaveBeenCalled();
		expect(cleanup).toBeUndefined();
	});

	it("ignores a wheel swipe over the row", () => {
		const { swipe, onReply, onArm, row } = touchOnlyHarness();

		for (let step = 0; step < 6; step++) {
			row.dispatchEvent(
				new WheelEvent("wheel", {
					deltaX: -16,
					deltaMode: 0,
					cancelable: true,
				}),
			);
			row.scrollLeft -= 16;
			row.dispatchEvent(new Event("scroll"));
		}
		row.dispatchEvent(new Event("scrollend"));

		expect(swipe.progress).toBe(0);
		expect(onArm).not.toHaveBeenCalled();
		expect(onReply).not.toHaveBeenCalled();
	});

	it("still arms and replies to a touch drag", () => {
		const { swipe, onReply, onArm } = touchOnlyHarness();

		drag(swipe, { x: TRIGGER_DISTANCE_PX + 20 });
		expect(swipe.armed).toBe(true);
		expect(onArm).toHaveBeenCalledOnce();
		swipe.handlers.onpointerup?.(pointer() as never);

		expect(onReply).toHaveBeenCalledOnce();
	});
});
