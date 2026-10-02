// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

const { reconcileHandlers } = vi.hoisted(() => ({
	reconcileHandlers: [] as (() => void)[],
}));

vi.mock("$lib/util/reconcile", () => ({
	reconciler: {
		subscribe(handler: () => void) {
			reconcileHandlers.push(handler);
			return () =>
				reconcileHandlers.splice(reconcileHandlers.indexOf(handler), 1);
		},
	},
}));

import { setVisibility } from "$lib/test/visibility";
import { resetNowForTesting, setNowForTesting } from "$lib/util/clock";
import { retryBrokenMediaWhenOnline } from "./media-retry-signals";
import { mediaRetry } from "./media-retry.svelte";

let clock = 2_000_000_000;
const later = () => setNowForTesting(() => (clock += 60_000));

afterEach(() => resetNowForTesting());

describe("retryBrokenMediaWhenOnline", () => {
	it("nudges broken media after a reconnect or when the browser goes online", () => {
		const stop = retryBrokenMediaWhenOnline();
		const before = mediaRetry.generation;

		later();
		reconcileHandlers[0]?.();
		later();
		window.dispatchEvent(new Event("online"));

		expect(mediaRetry.generation).toBe(before + 2);
		stop();
		later();
		window.dispatchEvent(new Event("online"));
		expect(mediaRetry.generation).toBe(before + 2);
		expect(reconcileHandlers).toHaveLength(0);
	});

	it("nudges broken media when the window is shown again, not when it is hidden", () => {
		const stop = retryBrokenMediaWhenOnline();
		const before = mediaRetry.generation;

		setVisibility("hidden");
		expect(mediaRetry.generation).toBe(before);

		setVisibility("visible");
		expect(mediaRetry.generation).toBe(before + 1);

		stop();
		setVisibility("hidden");
		setVisibility("visible");
		expect(mediaRetry.generation).toBe(before + 1);
	});
});
