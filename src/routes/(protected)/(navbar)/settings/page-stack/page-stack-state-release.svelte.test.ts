import { flushSync } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
	releaseTiming,
	stackMotion,
} from "#lib/components/navigation/stack/motion.ts";
import {
	navigationEvent,
	settleLast,
} from "#lib/components/navigation/stack/stack-test-helpers.ts";
import { makeStack, motion, push } from "./page-stack-test-helpers";

afterEach(() => {
	document.body.innerHTML = "";
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

describe("PageStackState releasing a swipe", () => {
	it("finishes a released swipe at the finger's speed where the platform matches it", async () => {
		const ios = stackMotion({ platform: "ios" });
		const harness = makeStack({ stackedMotion: ios });
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

		const start = await stack.navigate(
			navigationEvent({ from: "/settings", to: "/settings/app" }),
		);
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

		const adopt = await stack.navigate(
			navigationEvent({
				from: "/settings/app",
				to: "/settings",
				delta: -1,
			}),
		);
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
			easing: motion.cancelEasing,
		});
		expect(stack.committing).toBe(false);
		await settleLast(animations);
		expect(stack.ghost).toBeNull();

		const pop = await stack.navigate(
			navigationEvent({
				from: "/settings/app",
				to: "/settings",
				delta: -1,
			}),
		);
		pop?.();
		expect(stack.ghost?.path).toBe("/settings/app");
		vi.useRealTimers();
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
		const adopt = await stack.navigate(
			navigationEvent({
				from: "/settings/app",
				to: "/settings",
				delta: -1,
			}),
		);
		adopt?.();
		const settled = animations.length;

		vi.advanceTimersByTime(1000);

		expect(animations).toHaveLength(settled);
		vi.useRealTimers();
	});
});

describe("PageStackState offering a back swipe", () => {
	it("offers one once a push leaves a page to go back to, reactively", async () => {
		const harness = makeStack();
		const offers: boolean[] = [];
		const stop = $effect.root(() => {
			$effect(() => {
				offers.push(harness.stack.canBeginSwipeBack);
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

		expect(stack.canBeginSwipeBack).toBe(true);
		expect(stack.beginSwipeBack()).toBe(false);
		expect(back).toHaveBeenCalledOnce();
	});
});
