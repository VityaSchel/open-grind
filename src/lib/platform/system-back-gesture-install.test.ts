import { flushSync } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

const { invoke } = vi.hoisted(() => ({
	invoke: vi.fn<(command: string, args?: unknown) => Promise<void>>(() =>
		Promise.resolve(),
	),
}));

vi.mock("@tauri-apps/api/core", async (importOriginal) => ({
	...(await importOriginal<typeof import("@tauri-apps/api/core")>()),
	invoke,
}));

import { resetPlatform, runningOn } from "#lib/test/platform.ts";
import {
	attachSystemBackGesture,
	installSystemBack,
	type SwipeBackStack,
} from "./system-back-gesture.svelte";

function armedPushes() {
	vi.runOnlyPendingTimers();
	return invoke.mock.calls
		.filter(([command]) => command === "set_back_swipe_armed")
		.map(([, args]) => (args as { armed: boolean }).armed);
}

afterEach(() => {
	resetPlatform();
	delete window.__iosBack;
	invoke.mockClear();
	vi.useRealTimers();
});

describe("installSystemBack on iOS", () => {
	it("arms the edge swipe for a stack that attached before the install", () => {
		vi.useFakeTimers({
			toFake: [
				"setTimeout",
				"clearTimeout",
				"requestAnimationFrame",
				"cancelAnimationFrame",
			],
		});
		runningOn("ios");
		document.elementFromPoint = () => document.body;
		let begun = 0;
		const stack: SwipeBackStack = {
			tracking: false,
			moving: false,
			offersSwipeBack: true,
			edgeZone: "shared",
			beginSwipeBack: () => {
				begun += 1;
				return true;
			},
			trackSwipeBack: () => {},
			commitSwipeBack: () => {},
			cancelSwipeBack: () => {},
		};
		const detach = attachSystemBackGesture(stack);
		flushSync();
		expect(
			armedPushes(),
			"native hears nothing before the install",
		).toEqual([]);

		installSystemBack();

		expect(armedPushes()).toEqual([true]);
		expect(window.__iosBack?.start({ x: 2, y: 400 })).toBe(true);
		expect(begun).toBe(1);
		detach();
	});
});
