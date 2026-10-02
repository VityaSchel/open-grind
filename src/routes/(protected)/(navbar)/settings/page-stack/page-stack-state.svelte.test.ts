import { afterEach, describe, expect, it, vi } from "vitest";

import {
	flushMicrotasks,
	navigationEvent,
	settleLast,
} from "$lib/components/navigation/stack/stack-test-helpers";
import { makeStack, motion, push } from "./page-stack-test-helpers";

afterEach(() => {
	document.body.innerHTML = "";
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe("PageStackState navigation", () => {
	it("enters a pushed page from the right over a snapshot of the old one", async () => {
		const { stack, applied, animations } = makeStack();

		const start = await stack.navigate(
			navigationEvent({ from: "/settings", to: "/settings/app" }),
		);
		expect(stack.liveRole).toBe("front");
		expect(stack.ghost?.path).toBe("/settings");
		expect(applied).toEqual([1]);

		start?.();
		expect(animations.at(-1)).toMatchObject({
			from: 1,
			to: 0,
			easing: motion.commitEasing,
		});

		await settleLast(animations);
		expect(stack.ghost).toBeNull();
	});

	it("slides a popped page away to the right over the page it was pushed from", async () => {
		const harness = makeStack();
		const { stack, applied, animations } = harness;
		await push(harness, { from: "/settings", to: "/settings/app" });
		applied.length = 0;

		const start = await stack.navigate(
			navigationEvent({ from: "/settings/app", to: "/settings" }),
		);
		expect(stack.liveRole).toBe("back");
		expect(stack.ghost?.path).toBe("/settings/app");
		expect(applied).toEqual([0]);

		start?.();
		expect(animations.at(-1)).toMatchObject({ from: 0, to: 1 });
	});

	it("slides a history move over several levels back onto the root it was pushed from", async () => {
		const harness = makeStack();
		const { stack, animations } = harness;
		await push(harness, { from: "/settings", to: "/settings/account" });
		await push(harness, {
			from: "/settings/account",
			to: "/settings/account/privacy",
		});

		const start = await stack.navigate(
			navigationEvent({
				from: "/settings/account/privacy",
				to: "/settings",
				delta: -2,
			}),
		);
		expect(stack.liveRole).toBe("back");

		start?.();
		expect(animations.at(-1)).toMatchObject({ from: 0, to: 1 });
	});

	it("cuts a pop onto a page it was never pushed from, even when another one waits beneath", async () => {
		const harness = makeStack();
		const { stack, applied, animations } = harness;
		await push(harness, {
			from: "/settings/account",
			to: "/settings/account/privacy",
		});
		const slides = animations.length;

		const start = await stack.navigate(
			navigationEvent({
				from: "/settings/account/privacy",
				to: "/settings",
			}),
		);

		expect(stack.ghost).toBeNull();
		expect(start).toBeUndefined();
		expect(animations).toHaveLength(slides);
		expect(applied.at(-1)).toBe(0);
	});

	it("slides down every level history says was pushed before the stack was mounted again, leaving the gesture to the system", async () => {
		const { stack, animations } = makeStack({
			pushedFrom: [{ path: "/settings" }, { path: "/settings/account" }],
		});
		expect(stack.canSwipeBack).toBe(false);

		for (const [from, to] of [
			["/settings/account/blocked", "/settings/account"],
			["/settings/account", "/settings"],
		] as const) {
			const slides = animations.length;
			const start = await stack.navigate(navigationEvent({ from, to }));
			expect(stack.ghost?.path).toBe(from);
			start?.();
			expect(animations).toHaveLength(slides + 1);
			expect(animations.at(-1)).toMatchObject({ from: 0, to: 1 });
			await settleLast(animations);
		}
	});

	it("cuts a backward history move that lands deeper instead of pushing it in", async () => {
		const { stack, animations } = makeStack();

		const start = await stack.navigate(
			navigationEvent({
				from: "/settings",
				to: "/settings/app",
				delta: -1,
			}),
		);

		expect(stack.ghost).toBeNull();
		expect(start).toBeUndefined();
		expect(animations).toHaveLength(0);
		expect(stack.canSwipeBack).toBe(false);
	});

	it("treats a forward history move as a push", async () => {
		const { stack, animations } = makeStack();

		const start = await stack.navigate(
			navigationEvent({
				from: "/settings",
				to: "/settings/app",
				delta: 1,
			}),
		);
		expect(stack.liveRole).toBe("front");

		start?.();
		expect(animations.at(-1)).toMatchObject({ from: 1, to: 0 });
	});

	it("does not animate between siblings", async () => {
		const { stack, animations } = makeStack();
		const start = await stack.navigate(
			navigationEvent({ from: "/settings/app", to: "/settings/profile" }),
		);
		expect(stack.ghost).toBeNull();
		expect(start).toBeUndefined();
		expect(animations).toHaveLength(0);
	});

	it("does not animate leaving the stack", async () => {
		const { stack, animations } = makeStack();
		await stack.navigate(
			navigationEvent({ from: "/settings", to: "/chat" }),
		);
		expect(stack.ghost).toBeNull();
		expect(animations).toHaveLength(0);
	});

	it("swaps pages at once under reduced motion, keeping the page beneath for the back gesture", async () => {
		const { stack, animations } = makeStack({ reducedMotion: true });
		const start = await stack.navigate(
			navigationEvent({ from: "/settings", to: "/settings/app" }),
		);
		expect(stack.ghost).toBeNull();
		expect(start).toBeUndefined();
		expect(animations).toHaveLength(0);
		expect(stack.canSwipeBack).toBe(true);
	});
});

describe("PageStackState swipe back under reduced motion", () => {
	it("follows the finger, then commits without a settle animation", async () => {
		const { stack, applied, animations } = makeStack({
			reducedMotion: true,
		});
		await stack.navigate(
			navigationEvent({ from: "/settings", to: "/settings/app" }),
		);

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
		const { stack, animations } = makeStack({ reducedMotion: true });
		await stack.navigate(
			navigationEvent({ from: "/settings", to: "/settings/app" }),
		);
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
		expect(stack.canSwipeBack).toBe(false);
		expect(stack.beginSwipeBack()).toBe(false);

		await push(harness, { from: "/settings", to: "/settings/app" });
		expect(stack.canSwipeBack).toBe(true);
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
			easing: motion.commitEasing,
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

		const adopt = await stack.navigate(
			navigationEvent({
				from: "/settings/account/privacy",
				to: "/settings/account",
				delta: -1,
			}),
		);
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

		await stack.navigate(
			navigationEvent({
				from: "/settings/app",
				to: "/settings",
				delta: -1,
			}),
		);
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
			easing: motion.cancelEasing,
		});
		await settleLast(animations);

		expect(back).not.toHaveBeenCalled();
		expect(stack.ghost).toBeNull();
		expect(stack.canSwipeBack).toBe(true);
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
		const start = await stack.navigate(
			navigationEvent({ from: "/settings/app", to: "/settings" }),
		);
		start?.();
		await flushMicrotasks();

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

		const start = await stack.navigate(
			navigationEvent({ from: "/settings/app", to: "/settings" }),
		);
		start?.();
		await settleLast(animations);

		expect(stack.canSwipeBack).toBe(false);
		expect(stack.beginSwipeBack()).toBe(false);
	});

	it("forgets cached pages that are no longer ancestors", async () => {
		const harness = makeStack();
		const { stack } = harness;
		await push(harness, { from: "/settings", to: "/settings/app" });
		await push(harness, {
			from: "/settings/app",
			to: "/settings/app/credits",
		});
		expect(stack.canSwipeBack).toBe(true);

		await stack.navigate(
			navigationEvent({ from: "/settings/app/credits", to: "/chat" }),
		);
		expect(stack.canSwipeBack).toBe(false);
	});

	it("drops one level per pop", async () => {
		const harness = makeStack();
		const { stack, animations } = harness;
		await push(harness, { from: "/settings", to: "/settings/app" });
		await push(harness, {
			from: "/settings/app",
			to: "/settings/app/credits",
		});

		const start = await stack.navigate(
			navigationEvent({
				from: "/settings/app/credits",
				to: "/settings/app",
			}),
		);
		start?.();
		await settleLast(animations);
		expect(stack.canSwipeBack).toBe(true);

		const toRoot = await stack.navigate(
			navigationEvent({ from: "/settings/app", to: "/settings" }),
		);
		toRoot?.();
		await settleLast(animations);
		expect(stack.canSwipeBack).toBe(false);
	});
});

describe("PageStackState back gesture during the slide-in", () => {
	async function slidingIn() {
		const harness = makeStack();
		const start = await harness.stack.navigate(
			navigationEvent({ from: "/settings", to: "/settings/app" }),
		);
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
			easing: motion.commitEasing,
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
			easing: motion.cancelEasing,
		});
		await settleLast(animations);
		expect(back).not.toHaveBeenCalled();
		expect(stack.ghost).toBeNull();
		expect(applied.at(-1)).toBe(0);
	});
});

describe("PageStackState commit with nothing to go back to", () => {
	it("restores the pane instead of navigating into an empty history", async () => {
		const harness = makeStack({ canGoBack: false });
		const { stack, applied, animations } = harness;
		const back = vi.spyOn(history, "back").mockImplementation(() => {});
		await push(harness, { from: "/settings", to: "/settings/app" });

		stack.beginSwipeBack();
		stack.trackSwipeBack(0.9);
		stack.commitSwipeBack();
		await settleLast(animations);

		expect(back).not.toHaveBeenCalled();
		expect(stack.ghost).toBeNull();
		expect(applied.at(-1)).toBe(0);
	});
});

describe("PageStackState state under interruption", () => {
	it("drops a gesture still in flight when a navigation starts", async () => {
		const harness = makeStack();
		const { stack } = harness;
		await push(harness, { from: "/settings", to: "/settings/app" });

		expect(stack.beginSwipeBack()).toBe(true);
		expect(stack.tracking).toBe(true);

		await stack.navigate(
			navigationEvent({ from: "/settings/app", to: "/settings/profile" }),
		);

		expect(
			stack.tracking,
			"a live gesture must not outlive a navigation",
		).toBe(false);
	});

	it("turns a push around from where it had reached, not from a full page", async () => {
		const { stack, applied, animations } = makeStack();
		const entering = await stack.navigate(
			navigationEvent({ from: "/settings", to: "/settings/app" }),
		);
		entering?.();
		animations.at(-1)!.reached = 0.7;

		const leaving = await stack.navigate(
			navigationEvent({ from: "/settings/app", to: "/settings" }),
		);
		expect(stack.ghost?.path).toBe("/settings/app");
		expect(applied.at(-1)).toBe(0.7);
		leaving?.();
		expect(animations.at(-1)).toMatchObject({ from: 0.7, to: 1 });
	});

	it("ignores the settle starter of a superseded navigation", async () => {
		const harness = makeStack();
		const { stack, animations } = harness;
		await push(harness, { from: "/settings", to: "/settings/app" });

		const stale = await stack.navigate(
			navigationEvent({
				from: "/settings/app",
				to: "/settings/app/credits",
			}),
		);
		await stack.navigate(
			navigationEvent({ from: "/settings/app", to: "/settings/profile" }),
		);
		const before = animations.length;

		stale?.();

		expect(
			animations.length,
			"the stale closure animated the wrong pair",
		).toBe(before);
	});
});
