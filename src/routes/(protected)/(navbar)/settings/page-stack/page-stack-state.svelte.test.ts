import { afterEach, describe, expect, it, vi } from "vitest";

import {
	navigationEvent,
	settleLast,
} from "#lib/components/navigation/stack/stack-test-helpers.ts";
import { androidMotion, makeStack, push } from "./page-stack-test-helpers";

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
			easing: androidMotion.commitEasing,
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
		expect(stack.offersSwipeBack).toBe(false);

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
		expect(stack.offersSwipeBack).toBe(false);
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
		expect(stack.offersSwipeBack).toBe(true);
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
