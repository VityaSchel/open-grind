import { flushSync, tick } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
	releaseTiming,
	stackMotion,
} from "#lib/components/navigation/stack/motion.ts";
import {
	flushMicrotasks,
	settleLast,
} from "#lib/components/navigation/stack/stack-test-helpers.ts";
import { androidMotion, go, makeStack, push } from "./page-stack-test-helpers";

afterEach(() => {
	document.body.innerHTML = "";
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

describe("PageStackState swipe back under reduced motion", () => {
	it("follows the finger, then commits without a settle animation", async () => {
		const harness = makeStack({ reducedMotion: true });
		const { stack, applied, animations } = harness;
		await go(harness, { from: "/settings", to: "/settings/app" });

		expect(stack.beginSwipeBack()).toBe(true);
		expect(stack.ghost?.path).toBe("/settings");
		stack.trackSwipeBack(0.4);
		expect(applied.at(-1)).toBe(0.4);

		stack.commitSwipeBack();
		expect(animations.at(-1)).toMatchObject({
			from: 0.4,
			to: 1,
			duration: 0,
		});
	});

	it("returns the pane without a settle animation when the gesture is canceled", async () => {
		const harness = makeStack({ reducedMotion: true });
		const { stack, animations } = harness;
		await go(harness, { from: "/settings", to: "/settings/app" });
		stack.beginSwipeBack();
		stack.trackSwipeBack(0.6);

		stack.cancelSwipeBack();

		expect(animations.at(-1)).toMatchObject({
			from: 0.6,
			to: 0,
			duration: 0,
		});
	});
});

describe("PageStackState swipe back", () => {
	it("is unavailable until a push has been seen", async () => {
		const harness = makeStack();
		const { stack } = harness;
		expect(stack.offersSwipeBack).toBe(false);
		expect(stack.beginSwipeBack()).toBe(false);

		await push(harness, { from: "/settings", to: "/settings/app" });
		expect(stack.offersSwipeBack).toBe(true);
	});

	it("reveals the cached page beneath the live one while tracking", async () => {
		const harness = makeStack();
		const { stack, applied } = harness;
		await push(harness, { from: "/settings", to: "/settings/app" });

		applied.length = 0;
		expect(stack.beginSwipeBack()).toBe(true);
		expect(stack.tracking).toBe(true);
		expect(stack.liveRole).toBe("front");
		expect(stack.ghost?.path).toBe("/settings");

		stack.trackSwipeBack(0.4);
		expect(applied.at(-1)).toBe(0.4);
	});

	it("clamps tracking to the pane", async () => {
		const harness = makeStack();
		const { stack, applied } = harness;
		await push(harness, { from: "/settings", to: "/settings/app" });
		stack.beginSwipeBack();

		stack.trackSwipeBack(-0.5);
		expect(applied.at(-1)).toBe(0);
		stack.trackSwipeBack(3);
		expect(applied.at(-1)).toBe(1);
	});

	it("navigates back only once the system gesture has finished animating", async () => {
		const harness = makeStack();
		const { stack, animations } = harness;
		const back = vi.spyOn(history, "back").mockImplementation(() => {});
		await push(harness, { from: "/settings", to: "/settings/app" });

		stack.beginSwipeBack();
		stack.trackSwipeBack(0.8);
		stack.commitSwipeBack();

		expect(animations.at(-1)).toMatchObject({
			to: 1,
			easing: androidMotion.commitEasing,
		});
		expect(back).not.toHaveBeenCalled();

		await settleLast(animations);
		expect(back).toHaveBeenCalledTimes(1);
	});

	it("goes back at once when a new swipe starts before the committed one has slid out, and leaves the new swipe to the system", async () => {
		const harness = makeStack();
		const { stack, applied, animations } = harness;
		const back = vi.spyOn(history, "back").mockImplementation(() => {});
		await push(harness, { from: "/settings", to: "/settings/account" });
		await push(harness, {
			from: "/settings/account",
			to: "/settings/account/privacy",
		});

		stack.beginSwipeBack();
		stack.trackSwipeBack(0.4);
		stack.commitSwipeBack();
		expect(back).not.toHaveBeenCalled();

		expect(stack.beginSwipeBack()).toBe(false);
		expect(back).toHaveBeenCalledTimes(1);
		expect(applied.at(-1)).toBe(1);
		expect(stack.tracking).toBe(false);

		const adopt = await go(harness, {
			from: "/settings/account/privacy",
			to: "/settings/account",
			delta: -1,
		});
		adopt?.();
		await flushMicrotasks();
		await settleLast(animations);

		expect(back).toHaveBeenCalledTimes(1);
		expect(stack.beginSwipeBack()).toBe(true);
		expect(stack.ghost?.path).toBe("/settings");
	});

	it("drops the committed back when another navigation lands before the slide ends", async () => {
		const harness = makeStack();
		const { stack, animations } = harness;
		const back = vi.spyOn(history, "back").mockImplementation(() => {});
		await push(harness, { from: "/settings", to: "/settings/app" });

		stack.beginSwipeBack();
		stack.trackSwipeBack(0.4);
		stack.commitSwipeBack();
		const commit = animations.at(-1);

		await go(harness, {
			from: "/settings/app",
			to: "/settings",
			delta: -1,
		});
		commit?.settle(true);
		await flushMicrotasks();
		await push(harness, { from: "/settings", to: "/settings/app" });

		expect(stack.beginSwipeBack()).toBe(true);
		expect(back).not.toHaveBeenCalled();
	});

	it("returns without navigating when the gesture is abandoned", async () => {
		const harness = makeStack();
		const { stack, animations } = harness;
		const back = vi.spyOn(history, "back").mockImplementation(() => {});
		await push(harness, { from: "/settings", to: "/settings/app" });

		stack.beginSwipeBack();
		stack.trackSwipeBack(0.2);
		stack.cancelSwipeBack();

		expect(animations.at(-1)).toMatchObject({
			to: 0,
			easing: androidMotion.cancelEasing,
		});
		await settleLast(animations);

		expect(back).not.toHaveBeenCalled();
		expect(stack.ghost).toBeNull();
		expect(stack.offersSwipeBack).toBe(true);
	});

	it("adopts the revealed page in place instead of animating it twice", async () => {
		const harness = makeStack();
		const { stack, applied, animations } = harness;
		vi.spyOn(history, "back").mockImplementation(() => {});
		await push(harness, { from: "/settings", to: "/settings/app" });

		stack.beginSwipeBack();
		stack.trackSwipeBack(0.9);
		stack.commitSwipeBack();
		await settleLast(animations);

		const pending = animations.length;
		applied.length = 0;
		const start = await go(harness, {
			from: "/settings/app",
			to: "/settings",
			delta: -1,
		});
		start?.();
		await tick();

		expect(animations).toHaveLength(pending);
		expect(applied).toContain(0);
		expect(stack.ghost).toBeNull();
		expect(stack.liveRole).toBe("front");
	});

	it("stops offering a swipe back once the gesture has returned to the root", async () => {
		const harness = makeStack();
		const { stack, animations } = harness;
		vi.spyOn(history, "back").mockImplementation(() => {});
		await push(harness, { from: "/settings", to: "/settings/app" });

		stack.beginSwipeBack();
		stack.trackSwipeBack(0.9);
		stack.commitSwipeBack();
		await settleLast(animations);

		const start = await go(harness, {
			from: "/settings/app",
			to: "/settings",
			delta: -1,
		});
		start?.();
		await settleLast(animations);

		expect(stack.offersSwipeBack).toBe(false);
		expect(stack.beginSwipeBack()).toBe(false);
	});

	it("offers nothing once a navigation leaves the stack", async () => {
		const harness = makeStack();
		const { stack } = harness;
		await push(harness, { from: "/settings", to: "/settings/app" });
		await push(harness, {
			from: "/settings/app",
			to: "/settings/app/credits",
		});
		expect(stack.offersSwipeBack).toBe(true);

		await go(harness, { from: "/settings/app/credits", to: "/chat" });
		expect(stack.offersSwipeBack).toBe(false);
	});

	it("drops one level per pop", async () => {
		const harness = makeStack();
		const { stack, animations } = harness;
		await push(harness, { from: "/settings", to: "/settings/app" });
		await push(harness, {
			from: "/settings/app",
			to: "/settings/app/credits",
		});

		const start = await go(harness, {
			from: "/settings/app/credits",
			to: "/settings/app",
			delta: -1,
		});
		start?.();
		await settleLast(animations);
		expect(stack.offersSwipeBack).toBe(true);

		const toRoot = await go(harness, {
			from: "/settings/app",
			to: "/settings",
			delta: -1,
		});
		toRoot?.();
		await settleLast(animations);
		expect(stack.offersSwipeBack).toBe(false);
	});
});

describe("PageStackState back gesture during the slide-in", () => {
	async function slidingIn() {
		const harness = makeStack();
		const start = await go(harness, {
			from: "/settings",
			to: "/settings/app",
		});
		start?.();
		const slideIn = harness.animations.at(-1)!;
		slideIn.reached = 0.6;
		return { ...harness, slideIn };
	}

	it("picks the page up where the slide-in has reached and lets the finger drive the rest of the way", async () => {
		const { stack, applied, slideIn } = await slidingIn();

		expect(stack.beginSwipeBack()).toBe(true);
		expect(applied.at(-1)).toBe(0.6);
		await flushMicrotasks();
		expect(stack.ghost?.path).toBe("/settings");

		stack.trackSwipeBack(0.5);
		expect(applied.at(-1)).toBeCloseTo(0.8);

		slideIn.reached = 0;
		stack.trackSwipeBack(0.5);
		expect(applied.at(-1)).toBe(0.5);
	});

	it("commits from where the picked-up page is and goes back once", async () => {
		const back = vi.spyOn(history, "back").mockImplementation(() => {});
		const { stack, animations } = await slidingIn();

		stack.beginSwipeBack();
		stack.trackSwipeBack(0.5);
		stack.commitSwipeBack();

		expect(animations.at(-1)).toMatchObject({
			from: expect.closeTo(0.8),
			to: 1,
			easing: androidMotion.commitEasing,
		});
		await settleLast(animations);
		expect(back).toHaveBeenCalledTimes(1);
	});

	it("finishes the slide-in when the gesture is canceled", async () => {
		const back = vi.spyOn(history, "back").mockImplementation(() => {});
		const { stack, applied, animations } = await slidingIn();

		stack.beginSwipeBack();
		stack.trackSwipeBack(0.5);
		stack.cancelSwipeBack();

		expect(animations.at(-1)).toMatchObject({
			from: expect.closeTo(0.8),
			to: 0,
			easing: androidMotion.cancelEasing,
		});
		await settleLast(animations);
		expect(back).not.toHaveBeenCalled();
		expect(stack.ghost).toBeNull();
		expect(applied.at(-1)).toBe(0);
	});
});

describe("PageStackState releasing a swipe", () => {
	it("finishes a released swipe at the finger's speed where the platform matches it", async () => {
		const ios = stackMotion({ platform: "ios" });
		const harness = makeStack({ motion: ios });
		const { stack, animations } = harness;
		await push(harness, { from: "/settings", to: "/settings/app" });

		stack.beginSwipeBack();
		stack.trackSwipeBack(0.3);
		stack.cancelSwipeBack({ velocity: -0.8 });

		expect(animations.at(-1)).toMatchObject(
			releaseTiming({
				distance: -0.3,
				velocity: -0.8,
				spring: ios.release!,
			}),
		);
	});
});

describe("PageStackState in motion", () => {
	it("counts as moving while a push slides in and while a swipe tracks or settles", async () => {
		const harness = makeStack();
		const { stack, animations } = harness;
		expect(stack.moving).toBe(false);

		const start = await go(harness, {
			from: "/settings",
			to: "/settings/app",
		});
		start?.();
		expect(stack.moving).toBe(true);
		await settleLast(animations);
		expect(stack.moving).toBe(false);

		stack.beginSwipeBack();
		expect(stack.moving).toBe(true);
		stack.cancelSwipeBack();
		expect(stack.moving).toBe(true);
		await settleLast(animations);
		expect(stack.moving).toBe(false);
	});
});

describe("PageStackState committing a swipe", () => {
	it("makes the page inert from the commit until the page it revealed takes its place", async () => {
		const harness = makeStack();
		const { stack, animations } = harness;
		vi.spyOn(history, "back").mockImplementation(() => {});
		await push(harness, { from: "/settings", to: "/settings/app" });

		stack.beginSwipeBack();
		stack.trackSwipeBack(0.7);
		expect(stack.committing).toBe(false);
		stack.commitSwipeBack();
		expect(stack.committing).toBe(true);
		await settleLast(animations);

		const adopt = await go(harness, {
			from: "/settings/app",
			to: "/settings",
			delta: -1,
		});
		adopt?.();
		expect(stack.committing).toBe(false);
	});

	it("keeps the page live when the swipe is cancelled", async () => {
		const harness = makeStack();
		const { stack } = harness;
		await push(harness, { from: "/settings", to: "/settings/app" });

		stack.beginSwipeBack();
		stack.trackSwipeBack(0.2);
		stack.cancelSwipeBack();

		expect(stack.committing).toBe(false);
	});

	it("slides the page back when the committed Back never navigates, and animates the pop that comes late", async () => {
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
		const harness = makeStack();
		const { stack, animations } = harness;
		vi.spyOn(history, "back").mockImplementation(() => {});
		await push(harness, { from: "/settings", to: "/settings/app" });
		stack.beginSwipeBack();
		stack.trackSwipeBack(0.7);
		stack.commitSwipeBack();
		await settleLast(animations);

		vi.advanceTimersByTime(999);
		const sliding = animations.length;
		vi.advanceTimersByTime(1);

		expect(animations).toHaveLength(sliding + 1);
		expect(animations.at(-1)).toMatchObject({
			from: 1,
			to: 0,
			easing: androidMotion.cancelEasing,
		});
		expect(stack.committing).toBe(false);
		await settleLast(animations);
		expect(stack.ghost).toBeNull();

		const pop = await go(harness, {
			from: "/settings/app",
			to: "/settings",
			delta: -1,
		});
		pop?.();
		expect(stack.ghost?.path).toBe("/settings/app");
	});

	it("never slides back a commit whose Back did navigate", async () => {
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
		const harness = makeStack();
		const { stack, animations } = harness;
		vi.spyOn(history, "back").mockImplementation(() => {});
		await push(harness, { from: "/settings", to: "/settings/app" });
		stack.beginSwipeBack();
		stack.commitSwipeBack();
		await settleLast(animations);
		const adopt = await go(harness, {
			from: "/settings/app",
			to: "/settings",
			delta: -1,
		});
		adopt?.();
		const settled = animations.length;

		vi.advanceTimersByTime(1000);

		expect(animations).toHaveLength(settled);
	});
});

describe("PageStackState offering a back swipe", () => {
	it("offers one once a push leaves a page to go back to, reactively", async () => {
		const harness = makeStack();
		const offers: boolean[] = [];
		const stop = $effect.root(() => {
			const offered = $derived(harness.stack.offersSwipeBack);
			$effect(() => {
				offers.push(offered);
			});
		});
		flushSync();

		await push(harness, { from: "/settings", to: "/settings/app" });
		flushSync();

		expect(offers).toEqual([false, true]);
		stop();
	});

	it("keeps offering one while a committed swipe slides out, so a second swipe can pay its back", async () => {
		const harness = makeStack();
		const { stack } = harness;
		const back = vi.spyOn(history, "back").mockImplementation(() => {});
		await push(harness, { from: "/settings", to: "/settings/app" });
		stack.beginSwipeBack();
		stack.trackSwipeBack(0.6);
		stack.commitSwipeBack();

		expect(stack.offersSwipeBack).toBe(true);
		expect(stack.beginSwipeBack()).toBe(false);
		expect(back).toHaveBeenCalledOnce();
	});

	it("stops offering one from the paid Back until the page lands, so a second swipe cannot go back twice", async () => {
		const harness = makeStack();
		const { stack, animations } = harness;
		const back = vi.spyOn(history, "back").mockImplementation(() => {});
		await push(harness, { from: "/settings", to: "/settings/account" });
		await push(harness, {
			from: "/settings/account",
			to: "/settings/account/privacy",
		});
		const offers: boolean[] = [];
		const stop = $effect.root(() => {
			const offered = $derived(stack.offersSwipeBack);
			$effect(() => {
				offers.push(offered);
			});
		});
		flushSync();

		stack.beginSwipeBack();
		stack.commitSwipeBack();
		await settleLast(animations);
		flushSync();

		expect(stack.beginSwipeBack()).toBe(false);
		expect(back).toHaveBeenCalledOnce();

		const adopt = await go(harness, {
			from: "/settings/account/privacy",
			to: "/settings/account",
			delta: -1,
		});
		adopt?.();
		flushSync();

		expect(offers).toEqual([true, false, true]);
		stop();
	});
});
