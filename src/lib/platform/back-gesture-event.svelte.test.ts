import { flushSync } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
	backGestureEventHandlers,
	type BackGestureLayer,
	runBackGestureHandlers,
	topBackGestureHandler,
} from "./back-gesture-event.svelte";

function register({
	layer,
	dismisses = true,
}: {
	layer: BackGestureLayer;
	dismisses?: boolean;
}) {
	const handler = vi.fn(() => !dismisses);
	backGestureEventHandlers.set(handler, layer);
	return handler;
}

afterEach(() => {
	backGestureEventHandlers.clear();
});

describe("back gesture layers", () => {
	it("runs an overlay registered before a stack and a screen handler first", () => {
		const overlay = register({ layer: "overlay" });
		const stack = register({ layer: "stack" });
		const screen = register({ layer: "screen" });

		expect(topBackGestureHandler()).toBe(overlay);
		expect(runBackGestureHandlers()).toBe(true);
		expect(overlay).toHaveBeenCalledOnce();
		expect(screen).not.toHaveBeenCalled();
		expect(stack).not.toHaveBeenCalled();
	});

	it("puts a screen handler above the stack whatever order they registered in", () => {
		const screen = register({ layer: "screen" });
		const stack = register({ layer: "stack" });

		expect(topBackGestureHandler()).toBe(screen);
		expect(runBackGestureHandlers()).toBe(true);
		expect(screen).toHaveBeenCalledOnce();
		expect(stack).not.toHaveBeenCalled();
	});

	it("lets the newest handler of a layer win", () => {
		const older = register({ layer: "overlay" });
		const newer = register({ layer: "overlay" });

		expect(topBackGestureHandler()).toBe(newer);
		expect(runBackGestureHandlers()).toBe(true);
		expect(newer).toHaveBeenCalledOnce();
		expect(older).not.toHaveBeenCalled();
	});

	it("falls through to the layer below past a handler with nothing to dismiss", () => {
		const idleOverlay = register({ layer: "overlay", dismisses: false });
		const screen = register({ layer: "screen" });

		expect(runBackGestureHandlers()).toBe(true);
		expect(idleOverlay).toHaveBeenCalledOnce();
		expect(screen).toHaveBeenCalledOnce();
	});

	it("reports nothing handled when every handler passes", () => {
		const stack = register({ layer: "stack", dismisses: false });

		expect(runBackGestureHandlers()).toBe(false);
		expect(stack).toHaveBeenCalledOnce();
	});

	it("restores the order below once the top handler is removed", () => {
		const stack = register({ layer: "stack" });
		const olderScreen = register({ layer: "screen" });
		const overlay = register({ layer: "overlay" });
		const newerScreen = register({ layer: "screen" });
		expect(topBackGestureHandler()).toBe(overlay);

		backGestureEventHandlers.delete(overlay);
		expect(topBackGestureHandler()).toBe(newerScreen);

		backGestureEventHandlers.delete(newerScreen);
		expect(topBackGestureHandler()).toBe(olderScreen);

		backGestureEventHandlers.delete(olderScreen);
		expect(topBackGestureHandler()).toBe(stack);

		backGestureEventHandlers.delete(stack);
		expect(topBackGestureHandler()).toBeUndefined();
	});

	it("tracks the top handler reactively", () => {
		const tops: unknown[] = [];
		const stop = $effect.root(() => {
			$effect(() => {
				tops.push(topBackGestureHandler());
			});
		});
		flushSync();
		const stack = register({ layer: "stack" });
		flushSync();
		const overlay = register({ layer: "overlay" });
		flushSync();

		expect(tops).toEqual([undefined, stack, overlay]);
		stop();
	});
});
