import { flushSync } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
	releaseTiming,
	stackMotion,
} from "#lib/components/navigation/stack/motion.ts";
import { makeStack, push } from "./page-stack-test-helpers";

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
