import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { callMethodMock, connectedHandlers, droppedHandlers } = vi.hoisted(
	() => ({
		callMethodMock: vi.fn(() => Promise.resolve(1)),
		connectedHandlers: [] as (() => void)[],
		droppedHandlers: [] as ((skipped: number) => void)[],
	}),
);

vi.mock("$lib/api/methods", async (importOriginal) => ({
	...(await importOriginal<typeof import("$lib/api/methods")>()),
	callMethod: callMethodMock,
}));
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

function dropEvents(skipped: number) {
	const [handler] = droppedHandlers;
	if (!handler) throw new Error("nothing subscribed to ws:events-dropped");
	handler(skipped);
}

function reconnect() {
	const [handler] = connectedHandlers;
	if (!handler) throw new Error("nothing subscribed to ws:connected");
	handler();
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

		dropEvents(3);
		await vi.advanceTimersByTimeAsync(0);

		expect(handler).toHaveBeenCalledTimes(1);
	});

	it("defers a resync that lands inside the throttle window instead of dropping it", async () => {
		const reconciler = await freshReconciler();
		const handler = vi.fn();
		reconciler.subscribe(handler);

		dropEvents(3);
		await vi.advanceTimersByTimeAsync(0);
		expect(handler).toHaveBeenCalledTimes(1);

		await vi.advanceTimersByTimeAsync(1200);
		dropEvents(7);
		await vi.advanceTimersByTimeAsync(0);
		expect(handler).toHaveBeenCalledTimes(1);

		await vi.advanceTimersByTimeAsync(800);
		expect(handler).toHaveBeenCalledTimes(2);
	});

	it("coalesces a burst of drops into a single resync", async () => {
		const reconciler = await freshReconciler();
		const handler = vi.fn();
		reconciler.subscribe(handler);

		dropEvents(3);
		await vi.advanceTimersByTimeAsync(0);
		expect(handler).toHaveBeenCalledTimes(1);

		await vi.advanceTimersByTimeAsync(1000);
		dropEvents(256);
		dropEvents(256);
		dropEvents(256);

		await vi.advanceTimersByTimeAsync(2000);
		expect(handler).toHaveBeenCalledTimes(2);
	});

	it("skips the pending resync when another trigger reconciles after the drop", async () => {
		const reconciler = await freshReconciler();
		const handler = vi.fn();
		reconciler.subscribe(handler);

		dropEvents(3);
		await vi.advanceTimersByTimeAsync(0);
		expect(handler).toHaveBeenCalledTimes(1);

		await vi.advanceTimersByTimeAsync(1200);
		dropEvents(7);

		// A reconnect reconcile lands after the drop, so it already covers it.
		await vi.advanceTimersByTimeAsync(800);
		reconnect();
		reconnect();
		await vi.advanceTimersByTimeAsync(0);
		expect(handler).toHaveBeenCalledTimes(2);

		await vi.advanceTimersByTimeAsync(2000);
		expect(handler).toHaveBeenCalledTimes(2);
	});
});
