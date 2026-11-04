import { flushSync } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

import { makeStack, push } from "./page-stack-test-helpers";

afterEach(() => {
	document.body.innerHTML = "";
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	vi.useRealTimers();
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
