import { flushSync } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NavigationTarget } from "@sveltejs/kit";

import { stackMotion } from "$lib/components/navigation/stack/motion";
import {
	fakeSurface,
	flushMicrotasks,
	navigationEvent,
	settleLast,
} from "$lib/components/navigation/stack/stack-test-helpers";
import { LiveStackState } from "./live-stack-state.svelte";

const LIST = "/chat";
const FIRST = "/chat/1:2";
const SECOND = "/chat/3:4";

const motion = stackMotion({ platform: "android" });

function makeStack({
	reducedMotion = false,
	backLandsOnBase = true,
	keyboardVisible = false,
	startAt = LIST,
} = {}) {
	let top = $state<string | null>(keyOf(startAt));
	const { surface, applied, animations } = fakeSurface();
	let hideKeyboard!: () => void;

	const stack = new LiveStackState({
		surface,
		motion,
		top: () => top,
		keyOf: (target: NavigationTarget) => keyOf(target.url.pathname),
		scope: LIST,
		reducedMotion: () => reducedMotion,
		backLandsOnBase: () => backLandsOnBase,
		keyboardVisible: () => keyboardVisible,
		keyboardHidden: () =>
			new Promise<void>((resolve) => {
				hideKeyboard = resolve;
			}),
	});

	const arrive = (path: string) => {
		top = keyOf(path);
		flushSync();
	};

	return {
		stack,
		applied,
		animations,
		arrive,
		hideKeyboard: () => hideKeyboard(),
	};
}

function keyOf(pathname: string): string | null {
	return pathname.startsWith(`${LIST}/`)
		? pathname.slice(LIST.length + 1)
		: null;
}

async function navigate(
	harness: ReturnType<typeof makeStack>,
	{ from, to }: { from: string; to: string },
) {
	const afterUpdate = await harness.stack.navigate(
		navigationEvent({ from, to }),
	);
	harness.arrive(to);
	afterUpdate?.();
	vi.advanceTimersToNextFrame();
	await flushMicrotasks();
}

function releasedSwipe({ progress }: { progress: number }) {
	const back = vi.fn();
	vi.stubGlobal("history", { back });
	const harness = makeStack({ startAt: FIRST });
	harness.stack.beginSwipeBack();
	harness.stack.trackSwipeBack(progress);
	harness.stack.commitSwipeBack();
	return { ...harness, back };
}

beforeEach(() => {
	vi.useFakeTimers({
		toFake: [
			"requestAnimationFrame",
			"cancelAnimationFrame",
			"setTimeout",
			"clearTimeout",
		],
	});
});

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

describe("LiveStackState opening a sheet", () => {
	it("keeps the base live and slides the sheet in from off screen", async () => {
		const harness = makeStack();
		const { stack, animations } = harness;

		const afterUpdate = await stack.navigate(
			navigationEvent({ from: LIST, to: FIRST }),
		);
		expect(stack.moving).toBe(true);
		expect(harness.applied.at(-1)).toBe(1);

		harness.arrive(FIRST);
		expect(stack.sheetKey).toBe("1:2");
		expect(stack.covered).toBe(false);

		afterUpdate?.();
		expect(animations).toHaveLength(0);
		vi.advanceTimersToNextFrame();
		await flushMicrotasks();
		expect(animations.at(-1)).toMatchObject({
			from: 1,
			to: 0,
			easing: motion.commitEasing,
		});

		await settleLast(animations);
		expect(stack.moving).toBe(false);
		expect(stack.covered).toBe(true);
	});

	it("swaps instantly under reduced motion", async () => {
		const harness = makeStack({ reducedMotion: true });

		await navigate(harness, { from: LIST, to: FIRST });

		expect(harness.animations).toHaveLength(0);
		expect(harness.applied.at(-1)).toBe(0);
		expect(harness.stack.covered).toBe(true);
	});
});

describe("LiveStackState closing a sheet", () => {
	async function opened(options: Parameters<typeof makeStack>[0] = {}) {
		const harness = makeStack(options);
		await navigate(harness, { from: LIST, to: FIRST });
		await settleLast(harness.animations);
		return harness;
	}

	it("keeps the leaving sheet mounted until it has slid out", async () => {
		const harness = await opened();
		const { stack, animations } = harness;

		await navigate(harness, { from: FIRST, to: LIST });
		expect(stack.leaving).toBe("1:2");
		expect(stack.sheetKey).toBe("1:2");
		expect(stack.covered).toBe(false);
		expect(animations.at(-1)).toMatchObject({ from: 0, to: 1 });

		await settleLast(animations);
		expect(stack.leaving).toBeNull();
		expect(stack.sheetKey).toBeNull();
	});

	it("reverses a push that Back interrupts from where it had reached", async () => {
		const harness = makeStack();
		const { stack, animations } = harness;
		await navigate(harness, { from: LIST, to: FIRST });
		animations.at(-1)!.reached = 0.4;

		await navigate(harness, { from: FIRST, to: LIST });

		expect(animations.at(-1)).toMatchObject({ from: 0.4, to: 1 });
		expect(stack.leaving).toBe("1:2");
	});

	it("lets a Back that lands before the push slid in rest without flashing the sheet over the list", async () => {
		const harness = makeStack();
		const { stack, animations, applied } = harness;
		await stack.navigate(navigationEvent({ from: LIST, to: FIRST }));
		harness.arrive(FIRST);
		const appliedBeforeBack = applied.length;

		await navigate(harness, { from: FIRST, to: LIST });

		expect(applied.slice(appliedBeforeBack)).not.toContain(0);
		expect(animations.at(-1)).toMatchObject({ from: 1, to: 1 });
		await settleLast(animations);
		expect(stack.sheetKey).toBeNull();
	});

	it("waits for the keyboard to close before sliding", async () => {
		const harness = await opened({ keyboardVisible: true });
		const before = harness.animations.length;

		await navigate(harness, { from: FIRST, to: LIST });
		expect(harness.animations).toHaveLength(before);

		harness.hideKeyboard();
		await flushMicrotasks();
		expect(harness.animations.at(-1)).toMatchObject({ from: 0, to: 1 });
	});

	it("cuts the leaving sheet when another one opens mid slide-out and slides the new one in from off screen", async () => {
		const harness = await opened();
		const { stack, animations, applied } = harness;
		await navigate(harness, { from: FIRST, to: LIST });
		animations.at(-1)!.reached = 0.6;

		const afterUpdate = await stack.navigate(
			navigationEvent({ from: LIST, to: SECOND }),
		);
		expect(stack.leaving).toBeNull();
		expect(stack.sheetKey).toBeNull();
		expect(applied.at(-1)).toBe(1);

		harness.arrive(SECOND);
		afterUpdate?.();
		vi.advanceTimersToNextFrame();
		await flushMicrotasks();
		expect(stack.sheetKey).toBe("3:4");
		expect(animations.at(-1)).toMatchObject({ from: 1, to: 0 });

		await settleLast(animations);
		expect(stack.covered).toBe(true);
	});

	it("brings the leaving sheet back live from where it had reached when it is reopened mid slide-out", async () => {
		const harness = await opened();
		const { stack, animations } = harness;
		await navigate(harness, { from: FIRST, to: LIST });
		animations.at(-1)!.reached = 0.6;

		const afterUpdate = await stack.navigate(
			navigationEvent({ from: LIST, to: FIRST }),
		);
		expect(stack.sheetKey, "stays mounted until the route arrives").toBe(
			"1:2",
		);

		harness.arrive(FIRST);
		afterUpdate?.();
		expect(stack.leaving).toBeNull();
		expect(stack.sheetKey).toBe("1:2");

		vi.advanceTimersToNextFrame();
		await flushMicrotasks();
		expect(animations.at(-1)).toMatchObject({ from: 0.6, to: 0 });
		expect(stack.covered).toBe(false);

		await settleLast(animations);
		expect(stack.covered).toBe(true);
	});

	it("ignores the settle of a navigation that a newer one replaced", async () => {
		const harness = await opened();
		const { stack, animations } = harness;

		const staleUpdate = await stack.navigate(
			navigationEvent({ from: FIRST, to: LIST }),
		);
		await navigate(harness, { from: FIRST, to: SECOND });
		const count = animations.length;
		staleUpdate?.();
		vi.advanceTimersToNextFrame();
		await flushMicrotasks();

		expect(animations).toHaveLength(count);
		expect(stack.leaving).toBeNull();
		expect(stack.sheetKey).toBe("3:4");
		expect(stack.covered).toBe(true);
	});
});

describe("LiveStackState between sheets and out of scope", () => {
	it("jumps between two sheets without animating", async () => {
		const harness = makeStack({ startAt: FIRST });

		await navigate(harness, { from: FIRST, to: SECOND });

		expect(harness.animations).toHaveLength(0);
		expect(harness.stack.sheetKey).toBe("3:4");
		expect(harness.applied.at(-1)).toBe(0);
	});

	it("leaves scope without animating", async () => {
		const harness = makeStack({ startAt: FIRST });

		await navigate(harness, { from: FIRST, to: "/profile/7" });

		expect(harness.animations).toHaveLength(0);
		expect(harness.stack.moving).toBe(false);
	});
});

describe("LiveStackState back gesture", () => {
	it("refuses when Back would not land on the base", () => {
		const { stack } = makeStack({ startAt: FIRST, backLandsOnBase: false });

		expect(stack.beginSwipeBack()).toBe(false);
		expect(stack.tracking).toBe(false);
	});

	it("refuses on the base itself", () => {
		const { stack } = makeStack();

		expect(stack.beginSwipeBack()).toBe(false);
	});

	it("uncovers the base, follows the finger and settles back on cancel", async () => {
		const harness = makeStack({ startAt: FIRST });
		const { stack, animations } = harness;

		expect(stack.beginSwipeBack()).toBe(true);
		expect(stack.covered).toBe(false);
		stack.trackSwipeBack(0.3);
		expect(harness.applied.at(-1)).toBe(0.3);

		stack.cancelSwipeBack();
		expect(stack.covered).toBe(false);
		expect(animations.at(-1)).toMatchObject({
			from: 0.3,
			to: 0,
			easing: motion.cancelEasing,
		});
		await settleLast(animations);
		expect(stack.covered).toBe(true);
	});

	it("goes back at the lift, and the pop that lands mid-slide rides the running slide instead of animating again", async () => {
		const harness = releasedSwipe({ progress: 0.6 });
		const { stack, animations, back } = harness;
		expect(back).toHaveBeenCalledOnce();
		expect(animations.at(-1)).toMatchObject({ from: 0.6, to: 1 });

		const count = animations.length;
		await navigate(harness, { from: FIRST, to: LIST });
		expect(animations).toHaveLength(count);
		expect(stack.leaving).toBe("1:2");
		expect(stack.sheetKey).toBe("1:2");
		expect(stack.moving).toBe(true);

		await settleLast(animations);
		expect(stack.sheetKey).toBeNull();
		expect(stack.moving).toBe(false);
		expect(back).toHaveBeenCalledOnce();
	});

	it("rests on the base at once when the pop lands after the committed slide has ended", async () => {
		const harness = releasedSwipe({ progress: 0.6 });
		const { stack, animations, back } = harness;
		await settleLast(animations);
		expect(back).toHaveBeenCalledOnce();
		expect(stack.sheetKey).toBe("1:2");
		expect(stack.covered).toBe(false);

		const count = animations.length;
		await navigate(harness, { from: FIRST, to: LIST });
		expect(animations).toHaveLength(count);
		expect(stack.sheetKey).toBeNull();
		expect(stack.moving).toBe(false);
	});

	it("leaves a new swipe to the system while the committed one is still sliding out, without going back twice or cutting the slide", async () => {
		const harness = releasedSwipe({ progress: 0.4 });
		const { stack, animations, applied, back } = harness;
		const appliedAtLift = applied.length;

		expect(stack.beginSwipeBack()).toBe(false);
		expect(applied).toHaveLength(appliedAtLift);

		const count = animations.length;
		await navigate(harness, { from: FIRST, to: LIST });
		expect(stack.beginSwipeBack()).toBe(false);
		expect(animations).toHaveLength(count);
		expect(stack.sheetKey).toBe("1:2");

		await settleLast(animations);
		expect(stack.sheetKey).toBeNull();
		expect(back).toHaveBeenCalledOnce();
	});

	it("opens another sheet over a committed swipe that is still sliding out", async () => {
		const harness = releasedSwipe({ progress: 0.4 });
		const { stack, animations } = harness;
		await navigate(harness, { from: FIRST, to: LIST });

		await navigate(harness, { from: LIST, to: SECOND });

		expect(stack.leaving).toBeNull();
		expect(stack.sheetKey).toBe("3:4");
		expect(animations.at(-1)).toMatchObject({ from: 1, to: 0 });
		await settleLast(animations);
		expect(stack.covered).toBe(true);
	});

	it("reopens the swiped-away sheet live from where its slide-out had reached", async () => {
		const harness = releasedSwipe({ progress: 0.4 });
		const { stack, animations } = harness;
		await navigate(harness, { from: FIRST, to: LIST });
		animations.at(-1)!.reached = 0.8;

		await navigate(harness, { from: LIST, to: FIRST });

		expect(stack.leaving).toBeNull();
		expect(stack.sheetKey).toBe("1:2");
		expect(animations.at(-1)).toMatchObject({ from: 0.8, to: 0 });
	});

	it("forgets the committed back when another navigation lands first, so a later pop animates", async () => {
		const harness = releasedSwipe({ progress: 0.4 });
		const { stack, animations, back } = harness;
		await navigate(harness, { from: FIRST, to: SECOND });
		expect(stack.sheetKey).toBe("3:4");
		expect(stack.covered).toBe(true);

		const count = animations.length;
		vi.advanceTimersByTime(1000);
		expect(animations).toHaveLength(count);

		await navigate(harness, { from: SECOND, to: LIST });
		expect(animations.at(-1)).toMatchObject({ from: 0, to: 1 });
		expect(stack.leaving).toBe("3:4");
		expect(back).toHaveBeenCalledOnce();
	});

	it("slides the sheet back when the committed Back never navigates, and animates the pop that comes late", async () => {
		const harness = releasedSwipe({ progress: 0.6 });
		const { stack, animations } = harness;
		await settleLast(animations);

		vi.advanceTimersByTime(1000);
		expect(animations.at(-1)).toMatchObject({
			from: 1,
			to: 0,
			easing: motion.cancelEasing,
		});
		await settleLast(animations);
		expect(stack.covered).toBe(true);

		await navigate(harness, { from: FIRST, to: LIST });
		expect(animations.at(-1)).toMatchObject({ from: 0, to: 1 });
	});

	it("settles a committed swipe instantly under reduced motion", () => {
		vi.stubGlobal("history", { back: vi.fn() });
		const harness = makeStack({ startAt: FIRST, reducedMotion: true });
		const { stack, animations } = harness;

		expect(stack.beginSwipeBack()).toBe(true);
		stack.trackSwipeBack(0.5);
		stack.commitSwipeBack();

		expect(animations.at(-1)).toMatchObject({ duration: 0 });
	});
});

describe("LiveStackState back gesture during the slide-in", () => {
	async function slidingIn() {
		const harness = makeStack();
		await navigate(harness, { from: LIST, to: FIRST });
		const slideIn = harness.animations.at(-1)!;
		slideIn.reached = 0.7;
		return { ...harness, slideIn };
	}

	it("picks the sheet up where the slide-in has reached and lets the finger drive the rest of the way", async () => {
		const { stack, applied, slideIn } = await slidingIn();

		expect(stack.beginSwipeBack()).toBe(true);
		expect(applied.at(-1)).toBe(0.7);
		expect(stack.covered).toBe(false);

		stack.trackSwipeBack(0.5);
		expect(applied.at(-1)).toBeCloseTo(0.85);

		slideIn.reached = 0;
		stack.trackSwipeBack(0.5);
		expect(applied.at(-1)).toBe(0.5);
	});

	it("commits from where the picked-up sheet is, goes back once at the lift and lets that slide carry the pop", async () => {
		const back = vi.fn();
		vi.stubGlobal("history", { back });
		const harness = await slidingIn();
		const { stack, animations } = harness;

		stack.beginSwipeBack();
		stack.trackSwipeBack(0.5);
		stack.commitSwipeBack();
		expect(back).toHaveBeenCalledOnce();
		expect(animations.at(-1)).toMatchObject({
			from: expect.closeTo(0.85),
			to: 1,
			easing: motion.commitEasing,
		});

		const count = animations.length;
		await navigate(harness, { from: FIRST, to: LIST });
		expect(animations).toHaveLength(count);
		expect(stack.sheetKey).toBe("1:2");

		await settleLast(animations);
		expect(stack.sheetKey).toBeNull();
		expect(stack.moving).toBe(false);
		expect(back).toHaveBeenCalledOnce();
	});

	it("finishes the slide-in when the gesture is canceled", async () => {
		const { stack, animations } = await slidingIn();

		stack.beginSwipeBack();
		stack.trackSwipeBack(0.5);
		stack.cancelSwipeBack();

		expect(animations.at(-1)).toMatchObject({
			from: expect.closeTo(0.85),
			to: 0,
			easing: motion.cancelEasing,
		});
		await settleLast(animations);
		expect(stack.covered).toBe(true);
	});

	it("picks the sheet up again while a canceled gesture slides it back", async () => {
		const { stack, applied, animations } = await slidingIn();
		stack.beginSwipeBack();
		stack.trackSwipeBack(0.5);
		stack.cancelSwipeBack();
		animations.at(-1)!.reached = 0.3;

		expect(stack.beginSwipeBack()).toBe(true);
		expect(applied.at(-1)).toBe(0.3);
	});

	it("leaves the gesture to the system before the sheet starts sliding in", async () => {
		const harness = makeStack();
		await harness.stack.navigate(
			navigationEvent({ from: LIST, to: FIRST }),
		);
		harness.arrive(FIRST);

		expect(harness.stack.beginSwipeBack()).toBe(false);
	});

	it("leaves the gesture to the system while a committed Back that has slid out is still on its way", async () => {
		const { stack, animations, back } = releasedSwipe({ progress: 0.6 });
		await settleLast(animations);

		expect(stack.beginSwipeBack()).toBe(false);
		expect(back).toHaveBeenCalledOnce();
	});
});
