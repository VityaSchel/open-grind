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

import { backGestureEventHandlers } from "#lib/platform/back-gesture-event.svelte.ts";
import { resetPlatform, runningOn } from "#lib/test/platform.ts";
import { makeStack } from "./system-back-gesture-test-helpers.svelte";
import {
	attachSystemBackGesture,
	installSystemBack,
} from "./system-back-gesture.svelte";

function armedPushes() {
	vi.runOnlyPendingTimers();
	return invoke.mock.calls
		.filter(([command]) => command === "set_back_swipe_armed")
		.map(([, args]) => (args as { armed: boolean }).armed);
}

afterEach(() => {
	resetPlatform();
	delete window.__iosBack;
	addPluginListener.mockClear();
	invoke.mockClear();
	vi.restoreAllMocks();
	vi.useRealTimers();
	backGestureEventHandlers.clear();
});

describe("on iOS", () => {
	const start = () => window.__iosBack?.start({ x: 2, y: 400 }) ?? false;

	beforeEach(() => {
		vi.useFakeTimers({
			toFake: [
				"setTimeout",
				"clearTimeout",
				"requestAnimationFrame",
				"cancelAnimationFrame",
			],
		});
		runningOn("ios");
		document.elementFromPoint = () => document.body;
		installSystemBack();
	});

	afterEach(() => {
		vi.runOnlyPendingTimers();
	});

	it("installs the edge swipe hooks and no Android Back hooks", () => {
		expect(window.__iosBack).toBeDefined();
		expect(window.__AndroidOnBackGesture).toBeUndefined();
		expect(addPluginListener).not.toHaveBeenCalled();
	});

	it("arms the edge swipe while the stack offers a swipe back, and disarms it when the stack detaches", () => {
		const { stack, offerSwipeBack } = makeStack({ offers: false });
		const detach = attachSystemBackGesture(stack);
		flushSync();
		expect(armedPushes()).toEqual([]);

		offerSwipeBack(true);
		offerSwipeBack(true);
		expect(armedPushes()).toEqual([true]);

		offerSwipeBack(false);
		expect(armedPushes()).toEqual([true, false]);
		offerSwipeBack(true);
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

	it("disarms while a guard on leaving the screen is up, and arms again once it goes", () => {
		const { stack } = makeStack();
		const detach = attachSystemBackGesture(stack);
		flushSync();
		expect(armedPushes()).toEqual([true]);
		const unsavedEdits = () => false;

		backGestureEventHandlers.set(unsavedEdits, "guard");
		flushSync();
		expect(armedPushes()).toEqual([true, false]);
		expect(start()).toBe(false);
		backGestureEventHandlers.delete(unsavedEdits);
		flushSync();

		expect(armedPushes()).toEqual([true, false, true]);
		detach();
	});

	it("keeps the swipe armed while it tracks, and cancels it when an overlay opens mid-swipe", () => {
		const { stack, calls, offerSwipeBack } = makeStack();
		const detach = attachSystemBackGesture(stack);
		flushSync();
		expect(start()).toBe(true);
		offerSwipeBack(false);
		expect(armedPushes()).toEqual([true]);

		backGestureEventHandlers.set(() => false, "overlay");
		flushSync();
		expect(armedPushes()).toEqual([true, false]);
		window.__iosBack?.finish({ commit: false, velocity: 0 });

		expect(calls.cancel).toBe(1);
		expect(calls.commit).toBe(0);
		detach();
	});

	it("disarms the edge swipe once a tracked swipe ends where the stack no longer offers one", () => {
		const { stack, offerSwipeBack } = makeStack();
		const detach = attachSystemBackGesture(stack);
		flushSync();
		expect(start()).toBe(true);
		offerSwipeBack(false);
		expect(armedPushes()).toEqual([true]);

		window.__iosBack?.finish({ commit: false, velocity: 0 });
		flushSync();

		expect(armedPushes()).toEqual([true, false]);
		detach();
	});

	it("feeds the stack native progress once a frame and settles on the release", () => {
		const { stack, calls, tracked, releases } = makeStack();
		const detach = attachSystemBackGesture(stack);
		flushSync();

		start();
		window.__iosBack?.progress(0.25);
		vi.advanceTimersToNextFrame();
		window.__iosBack?.progress(0.5);
		vi.advanceTimersToNextFrame();
		window.__iosBack?.finish({ commit: false, velocity: -0.4 });
		vi.advanceTimersToNextFrame();
		window.__iosBack?.finish({ commit: true, velocity: 2 });

		expect(tracked).toEqual([0.25, 0.5]);
		expect(calls.cancel).toBe(1);
		expect(releases).toEqual([{ velocity: -0.4 }]);
		expect(calls.commit, "a finish after the swipe ended is stale").toBe(0);
		expect(vi.getTimerCount()).toBe(0);
		detach();
	});

	it("arms for an older stack under a newer one that offers nothing, and disarms under an overlay or guard above both", () => {
		const older = makeStack();
		const detachOlder = attachSystemBackGesture(older.stack);
		const newer = makeStack({ offers: false });
		const detachNewer = attachSystemBackGesture(newer.stack);
		flushSync();
		expect(armedPushes()).toEqual([true]);

		for (const layer of ["overlay", "guard"] as const) {
			const handler = () => false;
			backGestureEventHandlers.set(handler, layer);
			flushSync();
			expect(armedPushes().at(-1), layer).toBe(false);
			expect(start()).toBe(false);
			backGestureEventHandlers.delete(handler);
			flushSync();
			expect(armedPushes().at(-1)).toBe(true);
		}
		expect(older.calls.begin).toBe(0);

		detachNewer();
		detachOlder();
		expect(armedPushes()).toEqual([true, false, true, false, true, false]);
	});

	it("disarms and prepares nothing while an older stack covers the screen it landed on, and arms for the newer one once the cover drops", () => {
		const older = makeStack({ offers: false });
		const detachOlder = attachSystemBackGesture(older.stack);
		const newer = makeStack();
		const detachNewer = attachSystemBackGesture(newer.stack);
		flushSync();
		expect(armedPushes()).toEqual([true]);

		older.cover(true);
		expect(armedPushes()).toEqual([true, false]);
		expect(start()).toBe(false);
		window.__iosBack?.prepare();
		window.dispatchEvent(new Event("touchend"));
		expect(newer.calls).toMatchObject({ begin: 0, prepare: 0 });

		older.cover(false);
		expect(armedPushes()).toEqual([true, false, true]);
		expect(start()).toBe(true);
		expect(newer.calls.begin).toBe(1);
		expect(older.calls.begin).toBe(0);

		window.__iosBack?.finish({ commit: false, velocity: 0 });
		detachNewer();
		detachOlder();
	});

	it("passes over a screen handler to start and commit an older stack under a newer one that offers nothing", () => {
		const older = makeStack();
		const detachOlder = attachSystemBackGesture(older.stack);
		const newer = makeStack({ offers: false });
		const detachNewer = attachSystemBackGesture(newer.stack);
		const cancelReply = vi.fn(() => false);
		backGestureEventHandlers.set(cancelReply, "screen");
		flushSync();

		expect(armedPushes()).toEqual([true]);
		expect(start()).toBe(true);
		window.__iosBack?.finish({ commit: true, velocity: 1 });

		expect(older.calls.commit).toBe(1);
		expect(newer.calls.begin).toBe(0);
		expect(cancelReply).not.toHaveBeenCalled();
		detachNewer();
		detachOlder();
	});

	it("re-arms for whichever stack is left offering a swipe back as stacks detach", () => {
		const older = makeStack({ offers: false });
		const detachOlder = attachSystemBackGesture(older.stack);
		const newer = makeStack();
		const detachNewer = attachSystemBackGesture(newer.stack);
		flushSync();
		expect(armedPushes()).toEqual([true]);

		detachNewer();
		expect(armedPushes()).toEqual([true, false]);
		older.offerSwipeBack(true);
		expect(armedPushes()).toEqual([true, false, true]);
		expect(start()).toBe(true);
		expect(older.calls.begin).toBe(1);
		expect(newer.calls.begin).toBe(0);

		window.__iosBack?.finish({ commit: false, velocity: 0 });
		detachOlder();
		expect(armedPushes()).toEqual([true, false, true, false]);
	});

	it("keeps arming for the stacks left once the first stack to attach unmounts in an update that also moves the arm", () => {
		let firstMounted = $state(true);
		const first = makeStack();
		const screen = makeStack({ offers: false });
		const unmountFirst = $effect.root(() => {
			$effect.pre(() => {
				if (!firstMounted) return;
				$effect(() => attachSystemBackGesture(first.stack));
			});
		});
		flushSync();
		const detachScreen = attachSystemBackGesture(screen.stack);
		flushSync();
		expect(armedPushes()).toEqual([true]);

		firstMounted = false;
		first.offerSwipeBack(false);
		expect(armedPushes()).toEqual([true, false]);
		screen.offerSwipeBack(true);

		expect(armedPushes().at(-1)).toBe(true);
		expect(start()).toBe(true);
		expect(screen.calls.begin).toBe(1);
		window.__iosBack?.finish({ commit: false, velocity: 0 });
		detachScreen();
		unmountFirst();
	});

	it("lets the stack that offers a swipe back prepare for it and undo it, under a newer one that offers none", () => {
		const older = makeStack();
		const detachOlder = attachSystemBackGesture(older.stack);
		const newer = makeStack({ offers: false });
		const detachNewer = attachSystemBackGesture(newer.stack);

		window.__iosBack?.prepare();
		window.dispatchEvent(new Event("touchend"));

		expect(older.calls).toMatchObject({ prepare: 1, undo: 1 });
		expect(newer.calls).toMatchObject({ prepare: 0, undo: 0 });
		detachNewer();
		detachOlder();
	});
});
