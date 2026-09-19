import { afterEach, describe, expect, it } from "vitest";

import { backGestureEventHandlers } from "$lib/platform/back-gesture-event.svelte";
import { attachSystemBackGesture, type SystemBackTarget } from "./system-back";

function makeTarget() {
	let tracking = false;
	const calls = { begin: 0, commit: 0, cancel: 0 };

	const target: SystemBackTarget = {
		begin: () => {
			calls.begin += 1;
			tracking = true;
			return true;
		},
		track: () => {},
		commit: () => {
			calls.commit += 1;
			tracking = false;
		},
		cancel: () => {
			calls.cancel += 1;
			tracking = false;
		},
		tracking: () => tracking,
	};

	return { target, calls, isTracking: () => tracking };
}

afterEach(() => {
	backGestureEventHandlers.clear();
});

describe("attachSystemBackGesture", () => {
	it("starts a swipe when nothing else owns the back gesture", () => {
		const { target, calls } = makeTarget();
		const detach = attachSystemBackGesture(target);

		expect(window.__AndroidOnBackGestureStart?.()).toBe(true);
		expect(calls.begin).toBe(1);

		detach();
	});

	it("refuses to start while an overlay owns the back gesture", () => {
		const { target, calls, isTracking } = makeTarget();
		const detach = attachSystemBackGesture(target);
		backGestureEventHandlers.add(() => false);

		expect(window.__AndroidOnBackGestureStart?.()).toBe(false);
		expect(calls.begin, "the swipe must not arm").toBe(0);
		expect(isTracking(), "tracking would never be turned off again").toBe(
			false,
		);

		detach();
	});

	it("starts again once the overlay is gone", () => {
		const { target, calls } = makeTarget();
		const detach = attachSystemBackGesture(target);
		const overlay = () => false;
		backGestureEventHandlers.add(overlay);
		window.__AndroidOnBackGestureStart?.();
		backGestureEventHandlers.delete(overlay);

		expect(window.__AndroidOnBackGestureStart?.()).toBe(true);
		expect(calls.begin).toBe(1);

		detach();
	});
});
