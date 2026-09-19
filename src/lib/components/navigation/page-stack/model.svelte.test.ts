import { afterEach, describe, expect, it, vi } from "vitest";
import type { OnNavigate } from "@sveltejs/kit";

import { PageStack } from "./model.svelte";
import { CANCEL_EASING, COMMIT_EASING } from "./motion";
import type { StackSurface } from "./surface";

type PendingAnimation = {
	from: number;
	to: number;
	duration: number;
	easing: string;
	settle: (completed: boolean) => void;
};

function makeStack({ reducedMotion = false, canGoBack = true } = {}) {
	vi.stubGlobal("navigation", { canGoBack });

	const pane = document.createElement("div");
	pane.innerHTML = "<p>live</p>";
	document.body.append(pane);

	const applied: number[] = [];
	const animations: PendingAnimation[] = [];

	const surface: StackSurface = {
		apply: (progress) => applied.push(progress),
		animate: ({ from, to, duration, easing }) => {
			let settle!: (completed: boolean) => void;
			const completed = new Promise<boolean>((resolve) => {
				settle = resolve;
			});
			animations.push({ from, to, duration, easing, settle });
			return { completed, cancel: () => settle(false) };
		},
	};

	const stack = new PageStack({
		surface,
		livePane: () => pane,
		reducedMotion: () => reducedMotion,
		inScope: (pathname) =>
			pathname === "/settings" || pathname.startsWith("/settings/"),
	});

	return { stack, pane, applied, animations };
}

function navigation(from: string, to: string, delta?: number): OnNavigate {
	return {
		type: delta === undefined ? "link" : "popstate",
		delta,
		from: { url: new URL(`http://app${from}`) },
		to: { url: new URL(`http://app${to}`) },
	} as OnNavigate;
}

async function settleLast(animations: PendingAnimation[]) {
	animations.at(-1)?.settle(true);
	await Promise.resolve();
	await Promise.resolve();
}

async function push(
	stack: PageStack,
	animations: PendingAnimation[],
	from: string,
	to: string,
) {
	const start = await stack.navigate(navigation(from, to));
	start?.();
	await settleLast(animations);
}

afterEach(() => {
	document.body.innerHTML = "";
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe("PageStack navigation", () => {
	it("enters a pushed page from the right over a snapshot of the old one", async () => {
		const { stack, applied, animations } = makeStack();

		const start = await stack.navigate(
			navigation("/settings", "/settings/app"),
		);
		expect(stack.liveRole).toBe("front");
		expect(stack.ghost?.path).toBe("/settings");
		expect(applied).toEqual([1]);

		start?.();
		expect(animations.at(-1)).toMatchObject({
			from: 1,
			to: 0,
			easing: COMMIT_EASING,
		});

		await settleLast(animations);
		expect(stack.ghost).toBeNull();
	});

	it("slides a popped page away to the right over the page beneath", async () => {
		const { stack, applied, animations } = makeStack();

		const start = await stack.navigate(
			navigation("/settings/app", "/settings"),
		);
		expect(stack.liveRole).toBe("back");
		expect(applied).toEqual([0]);

		start?.();
		expect(animations.at(-1)).toMatchObject({ from: 0, to: 1 });
	});

	it("treats a backward history move as a pop even when it lands deeper", async () => {
		const { stack, applied, animations } = makeStack();

		const start = await stack.navigate(
			navigation("/settings", "/settings/app", -1),
		);
		expect(stack.liveRole).toBe("back");
		expect(applied).toEqual([0]);

		start?.();
		expect(animations.at(-1)).toMatchObject({ from: 0, to: 1 });
	});

	it("treats a forward history move as a push", async () => {
		const { stack, animations } = makeStack();

		const start = await stack.navigate(
			navigation("/settings", "/settings/app", 1),
		);
		expect(stack.liveRole).toBe("front");

		start?.();
		expect(animations.at(-1)).toMatchObject({ from: 1, to: 0 });
	});

	it("does not animate between siblings", async () => {
		const { stack, animations } = makeStack();
		const start = await stack.navigate(
			navigation("/settings/app", "/settings/profile"),
		);
		expect(stack.ghost).toBeNull();
		expect(start).toBeUndefined();
		expect(animations).toHaveLength(0);
	});

	it("does not animate leaving the stack", async () => {
		const { stack, animations } = makeStack();
		await stack.navigate(navigation("/settings", "/chat"));
		expect(stack.ghost).toBeNull();
		expect(animations).toHaveLength(0);
	});

	it("swaps pages at once under reduced motion, keeping the page beneath for the back gesture", async () => {
		const { stack, animations } = makeStack({ reducedMotion: true });
		const start = await stack.navigate(
			navigation("/settings", "/settings/app"),
		);
		expect(stack.ghost).toBeNull();
		expect(start).toBeUndefined();
		expect(animations).toHaveLength(0);
		expect(stack.canSwipeBack).toBe(true);
	});
});

describe("PageStack swipe back under reduced motion", () => {
	it("follows the finger, then commits without a settle animation", async () => {
		const { stack, applied, animations } = makeStack({
			reducedMotion: true,
		});
		await stack.navigate(navigation("/settings", "/settings/app"));

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
		await stack.navigate(navigation("/settings", "/settings/app"));
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

describe("PageStack swipe back", () => {
	it("is unavailable until a push has been seen", async () => {
		const { stack, animations } = makeStack();
		expect(stack.canSwipeBack).toBe(false);
		expect(stack.beginSwipeBack()).toBe(false);

		await push(stack, animations, "/settings", "/settings/app");
		expect(stack.canSwipeBack).toBe(true);
	});

	it("reveals the cached page beneath the live one while tracking", async () => {
		const { stack, applied, animations } = makeStack();
		await push(stack, animations, "/settings", "/settings/app");

		applied.length = 0;
		expect(stack.beginSwipeBack()).toBe(true);
		expect(stack.tracking).toBe(true);
		expect(stack.liveRole).toBe("front");
		expect(stack.ghost?.path).toBe("/settings");

		stack.trackSwipeBack(0.4);
		expect(applied.at(-1)).toBe(0.4);
	});

	it("clamps tracking to the pane", async () => {
		const { stack, applied, animations } = makeStack();
		await push(stack, animations, "/settings", "/settings/app");
		stack.beginSwipeBack();

		stack.trackSwipeBack(-0.5);
		expect(applied.at(-1)).toBe(0);
		stack.trackSwipeBack(3);
		expect(applied.at(-1)).toBe(1);
	});

	it("navigates back only once the system gesture has finished animating", async () => {
		const { stack, animations } = makeStack();
		const back = vi.spyOn(history, "back").mockImplementation(() => {});
		await push(stack, animations, "/settings", "/settings/app");

		stack.beginSwipeBack();
		stack.trackSwipeBack(0.8);
		stack.commitSwipeBack();

		expect(animations.at(-1)).toMatchObject({
			to: 1,
			easing: COMMIT_EASING,
		});
		expect(back).not.toHaveBeenCalled();

		await settleLast(animations);
		expect(back).toHaveBeenCalledTimes(1);
	});

	it("goes back at once when a new swipe starts before the committed one has slid out, and leaves the new swipe to the system", async () => {
		const { stack, applied, animations } = makeStack();
		const back = vi.spyOn(history, "back").mockImplementation(() => {});
		await push(stack, animations, "/settings", "/settings/account");
		await push(
			stack,
			animations,
			"/settings/account",
			"/settings/account/privacy",
		);

		stack.beginSwipeBack();
		stack.trackSwipeBack(0.4);
		stack.commitSwipeBack();
		expect(back).not.toHaveBeenCalled();

		expect(stack.beginSwipeBack()).toBe(false);
		expect(back).toHaveBeenCalledTimes(1);
		expect(applied.at(-1)).toBe(1);
		expect(stack.tracking).toBe(false);

		const adopt = await stack.navigate(
			navigation("/settings/account/privacy", "/settings/account", -1),
		);
		adopt?.();
		await settleLast(animations);

		expect(back).toHaveBeenCalledTimes(1);
		expect(stack.beginSwipeBack()).toBe(true);
		expect(stack.ghost?.path).toBe("/settings");
	});

	it("drops the committed back when another navigation lands before the slide ends", async () => {
		const { stack, animations } = makeStack();
		const back = vi.spyOn(history, "back").mockImplementation(() => {});
		await push(stack, animations, "/settings", "/settings/app");

		stack.beginSwipeBack();
		stack.trackSwipeBack(0.4);
		stack.commitSwipeBack();
		const commit = animations.at(-1);

		await stack.navigate(navigation("/settings/app", "/settings", -1));
		commit?.settle(true);
		await settleLast(animations);
		await push(stack, animations, "/settings", "/settings/app");

		expect(stack.beginSwipeBack()).toBe(true);
		expect(back).not.toHaveBeenCalled();
	});

	it("returns without navigating when the gesture is abandoned", async () => {
		const { stack, animations } = makeStack();
		const back = vi.spyOn(history, "back").mockImplementation(() => {});
		await push(stack, animations, "/settings", "/settings/app");

		stack.beginSwipeBack();
		stack.trackSwipeBack(0.2);
		stack.cancelSwipeBack();

		expect(animations.at(-1)).toMatchObject({
			to: 0,
			easing: CANCEL_EASING,
		});
		await settleLast(animations);

		expect(back).not.toHaveBeenCalled();
		expect(stack.ghost).toBeNull();
		expect(stack.canSwipeBack).toBe(true);
	});

	it("adopts the revealed page in place instead of animating it twice", async () => {
		const { stack, applied, animations } = makeStack();
		vi.spyOn(history, "back").mockImplementation(() => {});
		await push(stack, animations, "/settings", "/settings/app");

		stack.beginSwipeBack();
		stack.trackSwipeBack(0.9);
		stack.commitSwipeBack();
		await settleLast(animations);

		const pending = animations.length;
		applied.length = 0;
		const start = await stack.navigate(
			navigation("/settings/app", "/settings"),
		);
		start?.();
		await Promise.resolve();
		await Promise.resolve();

		expect(animations).toHaveLength(pending);
		expect(applied).toContain(0);
		expect(stack.ghost).toBeNull();
		expect(stack.liveRole).toBe("front");
	});

	it("stops offering a swipe back once the gesture has returned to the root", async () => {
		const { stack, animations } = makeStack();
		vi.spyOn(history, "back").mockImplementation(() => {});
		await push(stack, animations, "/settings", "/settings/app");

		stack.beginSwipeBack();
		stack.trackSwipeBack(0.9);
		stack.commitSwipeBack();
		await settleLast(animations);

		const start = await stack.navigate(
			navigation("/settings/app", "/settings"),
		);
		start?.();
		await settleLast(animations);

		expect(stack.canSwipeBack).toBe(false);
		expect(stack.beginSwipeBack()).toBe(false);
	});

	it("forgets cached pages that are no longer ancestors", async () => {
		const { stack, animations } = makeStack();
		await push(stack, animations, "/settings", "/settings/app");
		await push(stack, animations, "/settings/app", "/settings/app/credits");
		expect(stack.canSwipeBack).toBe(true);

		await stack.navigate(navigation("/settings/app/credits", "/chat"));
		expect(stack.canSwipeBack).toBe(false);
	});

	it("drops one level per pop", async () => {
		const { stack, animations } = makeStack();
		await push(stack, animations, "/settings", "/settings/app");
		await push(stack, animations, "/settings/app", "/settings/app/credits");

		const start = await stack.navigate(
			navigation("/settings/app/credits", "/settings/app"),
		);
		start?.();
		await settleLast(animations);
		expect(stack.canSwipeBack).toBe(true);

		const toRoot = await stack.navigate(
			navigation("/settings/app", "/settings"),
		);
		toRoot?.();
		await settleLast(animations);
		expect(stack.canSwipeBack).toBe(false);
	});

	it("returns the pane home when the system cancels the gesture", async () => {
		const { stack, animations } = makeStack();
		const back = vi.spyOn(history, "back").mockImplementation(() => {});
		await push(stack, animations, "/settings", "/settings/app");

		stack.beginSwipeBack();
		stack.trackSwipeBack(0.7);
		stack.cancelSwipeBack();

		expect(animations.at(-1)).toMatchObject({
			to: 0,
			easing: CANCEL_EASING,
		});
		await settleLast(animations);
		expect(back).not.toHaveBeenCalled();
		expect(stack.ghost).toBeNull();
	});
});

describe("PageStack commit with nothing to go back to", () => {
	it("restores the pane instead of navigating into an empty history", async () => {
		const { stack, applied, animations } = makeStack({ canGoBack: false });
		const back = vi.spyOn(history, "back").mockImplementation(() => {});
		await push(stack, animations, "/settings", "/settings/app");

		stack.beginSwipeBack();
		stack.trackSwipeBack(0.9);
		stack.commitSwipeBack();
		await settleLast(animations);

		expect(back).not.toHaveBeenCalled();
		expect(stack.ghost).toBeNull();
		expect(applied.at(-1)).toBe(0);
	});
});

describe("PageStack state under interruption", () => {
	it("drops a gesture still in flight when a navigation starts", async () => {
		const { stack, animations } = makeStack();
		await push(stack, animations, "/settings", "/settings/app");

		expect(stack.beginSwipeBack()).toBe(true);
		expect(stack.tracking).toBe(true);

		await stack.navigate(navigation("/settings/app", "/settings/profile"));

		expect(
			stack.tracking,
			"a live gesture must not outlive a navigation",
		).toBe(false);
	});

	it("ignores the settle starter of a superseded navigation", async () => {
		const { stack, animations } = makeStack();
		await push(stack, animations, "/settings", "/settings/app");

		const stale = await stack.navigate(
			navigation("/settings/app", "/settings/app/credits"),
		);
		await stack.navigate(navigation("/settings/app", "/settings/profile"));
		const before = animations.length;

		stale?.();

		expect(
			animations.length,
			"the stale closure animated the wrong pair",
		).toBe(before);
	});
});
