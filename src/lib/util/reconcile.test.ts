import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { callMethodMock, connectedHandlers, droppedHandlers } = vi.hoisted(
	() => ({
		callMethodMock: vi.fn(() => Promise.resolve(1)),
		connectedHandlers: [] as (() => void)[],
		droppedHandlers: [] as ((skipped: number) => void)[],
	}),
);

vi.mock("$lib/api", () => ({ callMethod: callMethodMock }));
vi.mock("$lib/ws.svelte", () => ({
	ws: {
		onConnected(handler: () => void) {
			connectedHandlers.push(handler);
			return Promise.resolve(vi.fn());
		},
		onEventsDropped(handler: (skipped: number) => void) {
			droppedHandlers.push(handler);
			return Promise.resolve(vi.fn());
		},
	},
}));

async function freshReconciler() {
	connectedHandlers.length = 0;
	droppedHandlers.length = 0;
	vi.resetModules();
	const { reconciler } = await import("./reconcile");
	// The constructor subscribes through promise-returning mocks.
	await vi.advanceTimersByTimeAsync(0);
	return reconciler;
}

describe("Reconciler resync after dropped websocket events", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.spyOn(console, "warn").mockImplementation(() => undefined);
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it("reconciles immediately when no reconcile is in the throttle window", async () => {
		const reconciler = await freshReconciler();
		const handler = vi.fn();
		reconciler.subscribe(handler);

		droppedHandlers[0](3);
		await vi.advanceTimersByTimeAsync(0);

		expect(handler).toHaveBeenCalledTimes(1);
	});

	it("defers a resync that lands inside the throttle window instead of dropping it", async () => {
		const reconciler = await freshReconciler();
		const handler = vi.fn();
		reconciler.subscribe(handler);

		droppedHandlers[0](3);
		await vi.advanceTimersByTimeAsync(0);
		expect(handler).toHaveBeenCalledTimes(1);

		await vi.advanceTimersByTimeAsync(1200);
		droppedHandlers[0](7);
		await vi.advanceTimersByTimeAsync(0);
		expect(handler).toHaveBeenCalledTimes(1);

		await vi.advanceTimersByTimeAsync(800);
		expect(handler).toHaveBeenCalledTimes(2);
	});

	it("coalesces a burst of drops into a single resync", async () => {
		const reconciler = await freshReconciler();
		const handler = vi.fn();
		reconciler.subscribe(handler);

		droppedHandlers[0](3);
		await vi.advanceTimersByTimeAsync(0);
		expect(handler).toHaveBeenCalledTimes(1);

		await vi.advanceTimersByTimeAsync(1000);
		droppedHandlers[0](256);
		droppedHandlers[0](256);
		droppedHandlers[0](256);

		await vi.advanceTimersByTimeAsync(2000);
		expect(handler).toHaveBeenCalledTimes(2);
	});

	it("skips the pending resync when another trigger reconciles after the drop", async () => {
		const reconciler = await freshReconciler();
		const handler = vi.fn();
		reconciler.subscribe(handler);

		droppedHandlers[0](3);
		await vi.advanceTimersByTimeAsync(0);
		expect(handler).toHaveBeenCalledTimes(1);

		await vi.advanceTimersByTimeAsync(1200);
		droppedHandlers[0](7);

		// A reconnect reconcile lands after the drop, so it already covers it.
		await vi.advanceTimersByTimeAsync(800);
		connectedHandlers[0]();
		connectedHandlers[0]();
		await vi.advanceTimersByTimeAsync(0);
		expect(handler).toHaveBeenCalledTimes(2);

		await vi.advanceTimersByTimeAsync(2000);
		expect(handler).toHaveBeenCalledTimes(2);
	});
});
