import { afterEach, describe, expect, it, vi } from "vitest";

import {
	backGestureEventHandlers,
	runBackGestureHandlers,
} from "$lib/platform/back-gesture-event.svelte";
import {
	attachSystemBackGesture,
	type SwipeBackStack,
} from "./system-back-gesture";

function makeStack() {
	let tracking = false;
	const calls = { begin: 0, commit: 0, cancel: 0 };

	const stack: SwipeBackStack = {
		get tracking() {
			return tracking;
		},
		beginSwipeBack: () => {
			calls.begin += 1;
			tracking = true;
			return true;
		},
		trackSwipeBack: () => {},
		commitSwipeBack: () => {
			calls.commit += 1;
			tracking = false;
		},
		cancelSwipeBack: () => {
			calls.cancel += 1;
			tracking = false;
		},
	};

	return { stack, calls };
}

afterEach(() => {
	backGestureEventHandlers.clear();
});

describe("attachSystemBackGesture", () => {
	it("starts a swipe when nothing else owns the back gesture", () => {
		const { stack, calls } = makeStack();
		const detach = attachSystemBackGesture(stack);

		expect(window.__AndroidOnBackGestureStart?.()).toBe(true);
		expect(calls.begin).toBe(1);

		detach();
	});

	it("refuses to start while an overlay owns the back gesture", () => {
		const { stack, calls } = makeStack();
		const detach = attachSystemBackGesture(stack);
		backGestureEventHandlers.set(() => false, "overlay");

		expect(window.__AndroidOnBackGestureStart?.()).toBe(false);
		expect(calls.begin, "the swipe must not arm").toBe(0);
		expect(stack.tracking, "tracking would never be turned off again").toBe(
			false,
		);

		detach();
	});

	it("starts again once the overlay is gone", () => {
		const { stack, calls } = makeStack();
		const detach = attachSystemBackGesture(stack);
		const overlay = () => false;
		backGestureEventHandlers.set(overlay, "overlay");
		window.__AndroidOnBackGestureStart?.();
		backGestureEventHandlers.delete(overlay);

		expect(window.__AndroidOnBackGestureStart?.()).toBe(true);
		expect(calls.begin).toBe(1);

		detach();
	});

	it("refuses to start under an overlay that opened before the stack attached", () => {
		const overlay = vi.fn(() => false);
		backGestureEventHandlers.set(overlay, "overlay");
		const { stack, calls } = makeStack();
		const detach = attachSystemBackGesture(stack);

		expect(window.__AndroidOnBackGestureStart?.()).toBe(false);
		expect(calls.begin).toBe(0);
		expect(runBackGestureHandlers()).toBe(true);
		expect(overlay).toHaveBeenCalledOnce();
		expect(calls.commit).toBe(0);

		backGestureEventHandlers.delete(overlay);
		expect(window.__AndroidOnBackGestureStart?.()).toBe(true);
		expect(calls.begin).toBe(1);

		detach();
	});

	it("refuses to start under a screen handler that registered before the stack attached", () => {
		const cancelReply = () => false;
		backGestureEventHandlers.set(cancelReply, "screen");
		const { stack, calls } = makeStack();
		const detach = attachSystemBackGesture(stack);

		expect(window.__AndroidOnBackGestureStart?.()).toBe(false);
		expect(calls.begin).toBe(0);

		backGestureEventHandlers.delete(cancelReply);
		expect(window.__AndroidOnBackGestureStart?.()).toBe(true);
		expect(calls.begin).toBe(1);

		detach();
	});

	it("keeps the gesture of a host that attached before the old one detached", () => {
		const old = makeStack();
		const detachOld = attachSystemBackGesture(old.stack);
		const current = makeStack();
		const detachCurrent = attachSystemBackGesture(current.stack);

		detachOld();

		expect(window.__AndroidOnBackGestureStart?.()).toBe(true);
		expect(current.calls.begin).toBe(1);
		window.__AndroidOnBackGestureCancel?.();
		expect(current.calls.cancel).toBe(1);
		expect(old.calls.begin).toBe(0);

		detachCurrent();
		expect(window.__AndroidOnBackGestureStart).toBeUndefined();
	});
});
