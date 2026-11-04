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
import {
	attachSystemBackGesture,
	installSystemBack,
	stackInMotion,
	type SwipeBackStack,
	type SwipeRelease,
} from "./system-back-gesture.svelte";

function makeStack({ canBegin = true }: { canBegin?: boolean } = {}) {
	let tracking = $state(false);
	let moving = $state(false);
	let canBeginSwipeBack = $state(canBegin);
	const calls = { begin: 0, commit: 0, cancel: 0, prepare: 0, undo: 0 };
	const tracked: number[] = [];
	const releases: (SwipeRelease | undefined)[] = [];

	const stack: SwipeBackStack = {
		get tracking() {
			return tracking;
		},
		get moving() {
			return moving;
		},
		get canBeginSwipeBack() {
			return tracking || canBeginSwipeBack;
		},
		beginSwipeBack: () => {
			calls.begin += 1;
			tracking = true;
			return true;
		},
		trackSwipeBack: (progress) => {
			tracked.push(progress);
		},
		commitSwipeBack: (release) => {
			releases.push(release);
			calls.commit += 1;
			tracking = false;
		},
		cancelSwipeBack: (release) => {
			releases.push(release);
			calls.cancel += 1;
			tracking = false;
		},
		prepareSwipeBack: () => {
			calls.prepare += 1;
			return () => {
				calls.undo += 1;
			};
		},
	};

	const allowBegin = (allowed: boolean) => {
		canBeginSwipeBack = allowed;
		flushSync();
	};

	const slide = (sliding: boolean) => {
		moving = sliding;
	};

	return { stack, calls, tracked, releases, allowBegin, slide };
}

function armedPushes() {
	vi.runOnlyPendingTimers();
	return invoke.mock.calls
		.filter(([command]) => command === "set_back_swipe_armed")
		.map(([, args]) => (args as { armed: boolean }).armed);
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
	delete window.__iosBack;
	addPluginListener.mockClear();
	invoke.mockClear();
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

describe("on iOS", () => {
	const start = () => window.__iosBack?.start({ x: 2, y: 400 }) ?? false;

	beforeEach(() => {
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
		runningOn("ios");
		document.elementFromPoint = () => document.body;
		installSystemBack();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("installs the edge swipe hooks and no Android Back hooks", () => {
		expect(window.__iosBack).toBeDefined();
		expect(window.__AndroidOnBackGesture).toBeUndefined();
		expect(addPluginListener).not.toHaveBeenCalled();
	});

	it("arms the edge swipe while the stack can go back, and disarms it when the stack detaches", () => {
		const { stack, allowBegin } = makeStack({ canBegin: false });
		const detach = attachSystemBackGesture(stack);
		flushSync();
		expect(armedPushes()).toEqual([]);

		allowBegin(true);
		allowBegin(true);
		expect(armedPushes()).toEqual([true]);

		allowBegin(false);
		expect(armedPushes()).toEqual([true, false]);
		allowBegin(true);
		expect(armedPushes()).toEqual([true, false, true]);
		detach();
		expect(armedPushes()).toEqual([true, false, true, false]);
	});

	it("disarms under an overlay and arms again once it closes", () => {
		const { stack } = makeStack();
		const detach = attachSystemBackGesture(stack);
		flushSync();
		expect(armedPushes()).toEqual([true]);
		const overlay = () => false;

		backGestureEventHandlers.set(overlay, "overlay");
		flushSync();
		expect(armedPushes()).toEqual([true, false]);
		expect(start()).toBe(false);
		backGestureEventHandlers.delete(overlay);
		flushSync();

		expect(armedPushes()).toEqual([true, false, true]);
		detach();
	});

	it("stays armed over a screen handler and pops without running it", () => {
		const { stack, calls } = makeStack();
		const detach = attachSystemBackGesture(stack);
		const cancelReply = vi.fn(() => false);
		backGestureEventHandlers.set(cancelReply, "screen");
		flushSync();

		expect(armedPushes()).toEqual([true]);
		expect(start()).toBe(true);
		window.__iosBack?.finish({ commit: true, velocity: 1 });

		expect(calls.commit).toBe(1);
		expect(cancelReply).not.toHaveBeenCalled();
		detach();
	});

	it("keeps the swipe armed while it tracks, and cancels it when an overlay opens mid-swipe", () => {
		const { stack, calls, allowBegin } = makeStack();
		const detach = attachSystemBackGesture(stack);
		flushSync();
		expect(start()).toBe(true);
		allowBegin(false);
		expect(armedPushes()).toEqual([true]);

		backGestureEventHandlers.set(() => false, "overlay");
		flushSync();
		expect(armedPushes()).toEqual([true, false]);
		window.__iosBack?.finish({ commit: false, velocity: 0 });

		expect(calls.cancel).toBe(1);
		expect(calls.commit).toBe(0);
		detach();
	});

	it("feeds the stack native progress once a frame and settles on the release", () => {
		const frames: FrameRequestCallback[] = [];
		vi.spyOn(window, "requestAnimationFrame").mockImplementation(
			(callback) => frames.push(callback),
		);
		const runFrame = () => frames.shift()?.(performance.now());
		const { stack, calls, tracked, releases } = makeStack();
		const detach = attachSystemBackGesture(stack);
		flushSync();

		start();
		window.__iosBack?.progress(0.25);
		runFrame();
		window.__iosBack?.progress(0.5);
		runFrame();
		window.__iosBack?.finish({ commit: false, velocity: -0.4 });
		runFrame();
		window.__iosBack?.finish({ commit: true, velocity: 2 });

		expect(tracked).toEqual([0.25, 0.5]);
		expect(calls.cancel).toBe(1);
		expect(releases).toEqual([{ velocity: -0.4 }]);
		expect(calls.commit, "a finish after the swipe ended is stale").toBe(0);
		expect(frames).toHaveLength(0);
		detach();
	});

	it("lets the stack prepare for a swipe and undo it", () => {
		const { stack, calls } = makeStack();
		const detach = attachSystemBackGesture(stack);

		window.__iosBack?.prepare();
		window.dispatchEvent(new Event("touchend"));

		expect(calls).toMatchObject({ prepare: 1, undo: 1 });
		detach();
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
