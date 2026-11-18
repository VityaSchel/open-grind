import { flushSync } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { addPluginListener, invoke } = vi.hoisted(() => ({
	addPluginListener: vi.fn(() =>
		Promise.resolve({ unregister: () => Promise.resolve() }),
	),
	invoke: vi.fn<(command: string, args?: unknown) => Promise<void>>(() =>
		Promise.resolve(),
	),
}));

vi.mock("@tauri-apps/api/core", async (importOriginal) => ({
	...(await importOriginal<typeof import("@tauri-apps/api/core")>()),
	addPluginListener,
	invoke,
}));

import {
	backGestureEventHandlers,
	runBackGestureHandlers,
} from "#lib/platform/back-gesture-event.svelte.ts";
import { resetPlatform, runningOn } from "#lib/test/platform.ts";
import { makeStack } from "./system-back-gesture-test-helpers.svelte";
import {
	attachSystemBackGesture,
	installSystemBack,
	stackInMotion,
} from "./system-back-gesture.svelte";

beforeEach(() => {
	runningOn("android");
});

afterEach(() => {
	resetPlatform();
	delete window.__AndroidBack;
	delete window.__AndroidOnBackGesture;
	delete window.__AndroidOnBackGestureStart;
	delete window.__AndroidOnBackGestureCancel;
	delete window.__iosBack;
	addPluginListener.mockClear();
	invoke.mockClear();
	vi.restoreAllMocks();
	vi.useRealTimers();
	backGestureEventHandlers.clear();
});

describe("attachSystemBackGesture", () => {
	beforeEach(() => {
		installSystemBack();
	});

	it("starts a swipe when nothing else owns the back gesture", () => {
		const { stack, calls } = makeStack();
		const detach = attachSystemBackGesture(stack);

		expect(window.__AndroidOnBackGestureStart?.()).toBe(true);
		expect(calls.begin).toBe(1);

		detach();
	});

	it("tells native nothing of the edge zone, since Android's own Back gesture owns the edge", () => {
		const { stack, calls } = makeStack({ edgeZone: "goes-back" });
		const detach = attachSystemBackGesture(stack);
		flushSync();

		expect(window.__AndroidOnBackGestureStart?.()).toBe(true);
		expect(calls.begin).toBe(1);
		expect(invoke).not.toHaveBeenCalled();

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

	it("reports an attached stack in motion while it tracks or slides", () => {
		const { stack, slide } = makeStack();
		slide(true);
		expect(stackInMotion(), "a detached stack never counts").toBe(false);

		const detach = attachSystemBackGesture(stack);
		expect(stackInMotion()).toBe(true);
		slide(false);
		expect(stackInMotion()).toBe(false);
		window.__AndroidOnBackGestureStart?.();
		expect(stackInMotion()).toBe(true);

		detach();
		expect(stackInMotion()).toBe(false);
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

	it("gives the gesture to the newest stack that offers a swipe back", () => {
		const older = makeStack();
		const detachOlder = attachSystemBackGesture(older.stack);
		const newer = makeStack();
		const detachNewer = attachSystemBackGesture(newer.stack);

		expect(window.__AndroidOnBackGestureStart?.()).toBe(true);
		expect(newer.calls.begin).toBe(1);
		expect(older.calls.begin).toBe(0);
		window.__AndroidOnBackGestureCancel?.();
		expect(newer.calls.cancel).toBe(1);
		expect(older.calls.cancel).toBe(0);

		detachNewer();
		detachOlder();
	});

	it("hands the gesture back to an older stack once the newer one detaches", () => {
		const older = makeStack();
		const detachOlder = attachSystemBackGesture(older.stack);
		const newer = makeStack();
		const detachNewer = attachSystemBackGesture(newer.stack);

		detachNewer();

		expect(window.__AndroidOnBackGestureStart?.()).toBe(true);
		expect(older.calls.begin).toBe(1);
		expect(newer.calls.begin).toBe(0);
		window.__AndroidOnBackGestureCancel?.();
		expect(older.calls.cancel).toBe(1);

		detachOlder();
		expect(window.__AndroidOnBackGestureStart?.()).toBe(false);
		expect(older.calls.begin).toBe(1);
	});

	it("keeps the gesture with the newer stack when the older one detaches first", () => {
		const older = makeStack();
		const detachOlder = attachSystemBackGesture(older.stack);
		const newer = makeStack();
		const detachNewer = attachSystemBackGesture(newer.stack);

		detachOlder();

		expect(window.__AndroidOnBackGestureStart?.()).toBe(true);
		expect(newer.calls.begin).toBe(1);
		window.__AndroidOnBackGestureCancel?.();
		expect(newer.calls.cancel).toBe(1);
		expect(older.calls.begin).toBe(0);

		detachNewer();
		expect(window.__AndroidOnBackGestureStart?.()).toBe(false);
		expect(newer.calls.begin).toBe(1);
	});

	it("lets an older stack that offers a swipe back own the gesture under a newer one that offers none", () => {
		const older = makeStack();
		const detachOlder = attachSystemBackGesture(older.stack);
		const newer = makeStack({ offers: false });
		const detachNewer = attachSystemBackGesture(newer.stack);

		expect(window.__AndroidOnBackGestureStart?.()).toBe(true);
		expect(older.calls.begin).toBe(1);
		expect(newer.calls.begin).toBe(0);

		expect(
			runBackGestureHandlers(),
			"Back commits the tracking stack",
		).toBe(true);
		expect(older.calls.commit).toBe(1);
		expect(newer.calls.commit).toBe(0);

		detachNewer();
		detachOlder();
	});

	it.each(["overlay", "guard", "screen"] as const)(
		"refuses to start any stack under a %s handler",
		(layer) => {
			const older = makeStack();
			const detachOlder = attachSystemBackGesture(older.stack);
			const newer = makeStack({ offers: false });
			const detachNewer = attachSystemBackGesture(newer.stack);
			const handler = () => false;
			backGestureEventHandlers.set(handler, layer);

			expect(window.__AndroidOnBackGestureStart?.()).toBe(false);
			expect(older.calls.begin).toBe(0);
			expect(newer.calls.begin).toBe(0);

			backGestureEventHandlers.delete(handler);
			expect(window.__AndroidOnBackGestureStart?.()).toBe(true);
			expect(older.calls.begin).toBe(1);

			detachNewer();
			detachOlder();
		},
	);

	it("starts no stack while an older one covers the screen it landed on, and starts the newer one once the cover drops", () => {
		const older = makeStack({ offers: false });
		const detachOlder = attachSystemBackGesture(older.stack);
		const newer = makeStack();
		const detachNewer = attachSystemBackGesture(newer.stack);
		older.cover(true);

		expect(window.__AndroidOnBackGestureStart?.()).toBe(false);
		expect(older.calls.begin).toBe(0);
		expect(newer.calls.begin).toBe(0);

		older.cover(false);
		expect(window.__AndroidOnBackGestureStart?.()).toBe(true);
		expect(newer.calls.begin).toBe(1);
		expect(older.calls.begin).toBe(0);

		detachNewer();
		detachOlder();
	});

	it("feeds the native progress to the older stack it started", () => {
		vi.useFakeTimers({
			toFake: ["requestAnimationFrame", "cancelAnimationFrame"],
		});
		const older = makeStack();
		const detachOlder = attachSystemBackGesture(older.stack);
		const newer = makeStack({ offers: false });
		const detachNewer = attachSystemBackGesture(newer.stack);
		let progress = 0;
		window.__AndroidBack = {
			moveTaskToBack: () => {},
			gestureProgress: () => progress,
		};

		window.__AndroidOnBackGestureStart?.();
		progress = 0.25;
		vi.advanceTimersToNextFrame();
		window.__AndroidOnBackGestureCancel?.();
		vi.advanceTimersToNextFrame();

		expect(older.tracked).toEqual([0.25]);
		expect(newer.tracked).toEqual([]);
		expect(vi.getTimerCount(), "no frame may stay queued").toBe(0);

		detachNewer();
		detachOlder();
	});

	it("gives the gesture to an older stack still sliding when no stack offers a swipe back", () => {
		const older = makeStack({ offers: false });
		const detachOlder = attachSystemBackGesture(older.stack);
		const newer = makeStack({ offers: false });
		const detachNewer = attachSystemBackGesture(newer.stack);
		older.slide(true);

		expect(window.__AndroidOnBackGestureStart?.()).toBe(true);
		expect(older.calls.begin).toBe(1);
		expect(newer.calls.begin).toBe(0);

		detachNewer();
		detachOlder();
	});

	it("keeps feeding the tracking stack when an idle stack detaches, and stops once the tracking one detaches", () => {
		vi.useFakeTimers({
			toFake: ["requestAnimationFrame", "cancelAnimationFrame"],
		});
		const older = makeStack();
		const detachOlder = attachSystemBackGesture(older.stack);
		const newer = makeStack({ offers: false });
		const detachNewer = attachSystemBackGesture(newer.stack);
		let progress = 0;
		window.__AndroidBack = {
			moveTaskToBack: () => {},
			gestureProgress: () => progress,
		};

		window.__AndroidOnBackGestureStart?.();
		progress = 0.25;
		vi.advanceTimersToNextFrame();
		detachNewer();
		progress = 0.5;
		vi.advanceTimersToNextFrame();

		expect(older.tracked).toEqual([0.25, 0.5]);
		expect(newer.tracked).toEqual([]);

		detachOlder();
		expect(vi.getTimerCount(), "no frame may stay queued").toBe(0);
	});

	it("keeps the hook defined and refusing once no stack is attached", () => {
		const { stack } = makeStack();
		attachSystemBackGesture(stack)();

		expect(window.__AndroidOnBackGestureStart).toBeDefined();
		expect(window.__AndroidOnBackGestureStart?.()).toBe(false);
		expect(backGestureEventHandlers.size).toBe(0);
	});

	it("feeds the stack the native progress once a frame until the swipe ends", () => {
		vi.useFakeTimers({
			toFake: ["requestAnimationFrame", "cancelAnimationFrame"],
		});
		const { stack, tracked } = makeStack();
		const detach = attachSystemBackGesture(stack);
		let progress = 0;
		window.__AndroidBack = {
			moveTaskToBack: () => {},
			gestureProgress: () => progress,
		};

		window.__AndroidOnBackGestureStart?.();
		progress = 0.25;
		vi.advanceTimersToNextFrame();
		progress = 0.5;
		vi.advanceTimersToNextFrame();
		window.__AndroidOnBackGestureCancel?.();
		vi.advanceTimersToNextFrame();

		expect(tracked).toEqual([0.25, 0.5]);
		expect(vi.getTimerCount(), "no frame may stay queued").toBe(0);

		detach();
	});

	it("stops reading progress once the stack stops tracking on its own", () => {
		vi.useFakeTimers({
			toFake: ["requestAnimationFrame", "cancelAnimationFrame"],
		});
		const { stack, tracked } = makeStack();
		const detach = attachSystemBackGesture(stack);
		let progress = 0;
		window.__AndroidBack = {
			moveTaskToBack: () => {},
			gestureProgress: () => progress,
		};

		window.__AndroidOnBackGestureStart?.();
		progress = 0.25;
		vi.advanceTimersToNextFrame();
		stack.cancelSwipeBack();
		vi.advanceTimersToNextFrame();

		expect(tracked).toEqual([0.25]);
		expect(vi.getTimerCount(), "no frame may stay queued").toBe(0);

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

describe.each(["linux", "macos", "windows"] as const)("on %s", (platform) => {
	beforeEach(() => {
		runningOn(platform);
	});

	it("exposes no native hooks, yet the stack still lets Back through", () => {
		const { stack, calls } = makeStack();
		const detach = attachSystemBackGesture(stack);
		flushSync();

		expect(window.__AndroidOnBackGestureStart).toBeUndefined();
		expect(window.__AndroidOnBackGestureCancel).toBeUndefined();
		expect(backGestureEventHandlers.size).toBe(1);
		expect(runBackGestureHandlers()).toBe(false);
		expect(calls.begin).toBe(0);
		expect(calls.commit).toBe(0);
		expect(invoke).not.toHaveBeenCalled();

		detach();
		expect(backGestureEventHandlers.size).toBe(0);
	});

	it("installs no native Back hooks", () => {
		installSystemBack();

		expect(window.__AndroidOnBackGesture).toBeUndefined();
		expect(window.__iosBack).toBeUndefined();
		expect(addPluginListener).not.toHaveBeenCalled();
	});
});
