import { flushSync } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NavigationTarget } from "@sveltejs/kit";

import {
	CANCEL_EASING,
	COMMIT_EASING,
} from "$lib/components/navigation/stack/motion";
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
			easing: COMMIT_EASING,
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
			easing: CANCEL_EASING,
		});
		await settleLast(animations);
		expect(stack.covered).toBe(true);
	});

	it("goes back once on commit and does not animate the pop again", async () => {
		const back = vi.fn();
		vi.stubGlobal("history", { back });
		const harness = makeStack({ startAt: FIRST });
		const { stack, animations } = harness;

		stack.beginSwipeBack();
		stack.trackSwipeBack(0.6);
		stack.commitSwipeBack();
		expect(animations.at(-1)).toMatchObject({ from: 0.6, to: 1 });
		await settleLast(animations);
		expect(back).toHaveBeenCalledOnce();
		expect(stack.covered).toBe(false);

		const count = animations.length;
		await navigate(harness, { from: FIRST, to: LIST });
		expect(animations).toHaveLength(count);
		expect(stack.sheetKey).toBeNull();
		expect(stack.moving).toBe(false);
	});

	it("goes back at once when a new swipe starts before the committed one has slid out, and leaves the new swipe to the system", async () => {
		const back = vi.fn();
		vi.stubGlobal("history", { back });
		const harness = makeStack({ startAt: FIRST });
		const { stack, animations, applied } = harness;

		stack.beginSwipeBack();
		stack.trackSwipeBack(0.4);
		stack.commitSwipeBack();
		expect(back).not.toHaveBeenCalled();

		expect(stack.beginSwipeBack()).toBe(false);
		expect(back).toHaveBeenCalledOnce();
		expect(applied.at(-1)).toBe(1);

		const count = animations.length;
		await navigate(harness, { from: FIRST, to: LIST });
		expect(animations).toHaveLength(count);
		expect(stack.sheetKey).toBeNull();
		expect(back).toHaveBeenCalledOnce();
	});

	it("drops the committed back when another navigation lands before the slide ends", async () => {
		const back = vi.fn();
		vi.stubGlobal("history", { back });
		const harness = makeStack({ startAt: FIRST });
		const { stack, animations } = harness;

		stack.beginSwipeBack();
		stack.trackSwipeBack(0.4);
		stack.commitSwipeBack();
		await navigate(harness, { from: FIRST, to: SECOND });
		await settleLast(animations);

		expect(stack.beginSwipeBack()).toBe(true);
		expect(back).not.toHaveBeenCalled();
	});

	it("slides the sheet back when the committed Back never navigates", async () => {
		vi.stubGlobal("history", { back: vi.fn() });
		const harness = makeStack({ startAt: FIRST });
		const { stack, animations } = harness;

		stack.beginSwipeBack();
		stack.trackSwipeBack(0.6);
		stack.commitSwipeBack();
		await settleLast(animations);

		vi.advanceTimersByTime(1000);
		expect(animations.at(-1)).toMatchObject({
			from: 1,
			to: 0,
			easing: CANCEL_EASING,
		});
		await settleLast(animations);
		expect(stack.covered).toBe(true);
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
