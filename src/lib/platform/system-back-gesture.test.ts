import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { addPluginListener } = vi.hoisted(() => ({
	addPluginListener: vi.fn(() =>
		Promise.resolve({ unregister: () => Promise.resolve() }),
	),
}));

vi.mock("@tauri-apps/api/core", async (importOriginal) => ({
	...(await importOriginal<typeof import("@tauri-apps/api/core")>()),
	addPluginListener,
}));

import {
	backGestureEventHandlers,
	runBackGestureHandlers,
} from "$lib/platform/back-gesture-event.svelte";
import { resetPlatform, runningOn } from "$lib/test/platform";
import {
	attachSystemBackGesture,
	installSystemBack,
	type SwipeBackStack,
} from "./system-back-gesture";

function makeStack() {
	let tracking = false;
	const calls = { begin: 0, commit: 0, cancel: 0 };
	const tracked: number[] = [];

	const stack: SwipeBackStack = {
		get tracking() {
			return tracking;
		},
		beginSwipeBack: () => {
			calls.begin += 1;
			tracking = true;
			return true;
		},
		trackSwipeBack: (progress) => {
			tracked.push(progress);
		},
		commitSwipeBack: () => {
			calls.commit += 1;
			tracking = false;
		},
		cancelSwipeBack: () => {
			calls.cancel += 1;
			tracking = false;
		},
	};

	return { stack, calls, tracked };
}

beforeEach(() => {
	runningOn("android");
});

afterEach(() => {
	resetPlatform();
	delete window.__AndroidBack;
	delete window.__AndroidOnBackGesture;
	delete window.__AndroidOnBackGestureStart;
	delete window.__AndroidOnBackGestureCancel;
	addPluginListener.mockClear();
	vi.restoreAllMocks();
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

	it("feeds the stack the native progress once a frame until the swipe ends", () => {
		const frames: FrameRequestCallback[] = [];
		vi.spyOn(window, "requestAnimationFrame").mockImplementation(
			(callback) => frames.push(callback),
		);
		const runFrame = () => frames.shift()?.(performance.now());
		const { stack, tracked } = makeStack();
		const detach = attachSystemBackGesture(stack);
		let progress = 0;
		window.__AndroidBack = {
			moveTaskToBack: () => {},
			gestureProgress: () => progress,
		};

		window.__AndroidOnBackGestureStart?.();
		progress = 0.25;
		runFrame();
		progress = 0.5;
		runFrame();
		window.__AndroidOnBackGestureCancel?.();
		runFrame();

		expect(tracked).toEqual([0.25, 0.5]);
		expect(frames, "no frame may stay queued").toHaveLength(0);

		detach();
	});
});

describe("installSystemBack", () => {
	it("on Android the native Back learns whether the app took it, and the back button is heard", () => {
		installSystemBack();

		expect(addPluginListener).toHaveBeenCalledWith(
			"app",
			"back-button",
			expect.any(Function),
		);
		expect(window.__AndroidOnBackGesture?.()).toBe(true);

		const overlay = vi.fn(() => false);
		backGestureEventHandlers.set(overlay, "overlay");

		expect(window.__AndroidOnBackGesture?.()).toBe(false);
		expect(overlay).toHaveBeenCalledOnce();
	});
});

describe.each(["ios", "linux", "macos", "windows"] as const)(
	"on %s",
	(platform) => {
		beforeEach(() => {
			runningOn(platform);
		});

		it("exposes no native hooks, yet the stack still lets Back through", () => {
			const { stack, calls } = makeStack();
			const detach = attachSystemBackGesture(stack);

			expect(window.__AndroidOnBackGestureStart).toBeUndefined();
			expect(window.__AndroidOnBackGestureCancel).toBeUndefined();
			expect(backGestureEventHandlers.size).toBe(1);
			expect(runBackGestureHandlers()).toBe(false);
			expect(calls.begin).toBe(0);
			expect(calls.commit).toBe(0);

			detach();
			expect(backGestureEventHandlers.size).toBe(0);
		});

		it("installs no native Back hooks", () => {
			installSystemBack();

			expect(window.__AndroidOnBackGesture).toBeUndefined();
			expect(addPluginListener).not.toHaveBeenCalled();
		});
	},
);
