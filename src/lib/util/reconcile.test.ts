import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setVisibility } from "$lib/test/visibility";

const {
	callMethodMock,
	connectedHandlers,
	droppedHandlers,
	rejectedHandlers,
	isMobilePlatformMock,
} = vi.hoisted(() => ({
	callMethodMock: vi.fn(() =>
		Promise.resolve({ profileId: 1, expiresAt: null, stale: false }),
	),
	connectedHandlers: [] as (() => void)[],
	droppedHandlers: [] as ((skipped: number) => void)[],
	rejectedHandlers: [] as ((eventType: string) => void)[],
	isMobilePlatformMock: vi.fn(() => false),
}));

vi.mock("$lib/api/methods", async (importOriginal) => ({
	...(await importOriginal<typeof import("$lib/api/methods")>()),
	callMethod: callMethodMock,
}));
vi.mock("$lib/platform/os", () => ({ isMobilePlatform: isMobilePlatformMock }));
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
		onEventRejected(handler: (eventType: string) => void) {
			rejectedHandlers.push(handler);
			return vi.fn();
		},
	},
}));

const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;

const flushMockSubscriptions = () => vi.advanceTimersByTimeAsync(0);

async function freshReconciler() {
	connectedHandlers.length = 0;
	droppedHandlers.length = 0;
	rejectedHandlers.length = 0;
	vi.resetModules();
	const { reconciler } = await import("./reconcile");
	await flushMockSubscriptions();
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

async function hideFor(awayMs: number) {
	setVisibility("hidden");
	await vi.advanceTimersByTimeAsync(awayMs);
	setVisibility("visible");
	await flushMockSubscriptions();
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
		await flushMockSubscriptions();

		expect(handler).toHaveBeenCalledTimes(1);
	});

	it("defers a resync that lands inside the throttle window instead of dropping it", async () => {
		const reconciler = await freshReconciler();
		const handler = vi.fn();
		reconciler.subscribe(handler);

		dropEvents(3);
		await flushMockSubscriptions();
		expect(handler).toHaveBeenCalledTimes(1);

		await vi.advanceTimersByTimeAsync(1200);
		dropEvents(7);
		await flushMockSubscriptions();
		expect(handler).toHaveBeenCalledTimes(1);

		await vi.advanceTimersByTimeAsync(800);
		expect(handler).toHaveBeenCalledTimes(2);
	});

	it("resyncs after a websocket event is rejected as unparsable", async () => {
		const reconciler = await freshReconciler();
		const handler = vi.fn();
		reconciler.subscribe(handler);

		rejectedHandlers.forEach((rejected) => rejected("tap.v1.tap_sent"));
		await flushMockSubscriptions();

		expect(handler).toHaveBeenCalledTimes(1);
	});

	it("coalesces a burst of drops into a single resync", async () => {
		const reconciler = await freshReconciler();
		const handler = vi.fn();
		reconciler.subscribe(handler);

		dropEvents(3);
		await flushMockSubscriptions();
		expect(handler).toHaveBeenCalledTimes(1);

		await vi.advanceTimersByTimeAsync(1000);
		dropEvents(256);
		dropEvents(256);
		dropEvents(256);

		await vi.advanceTimersByTimeAsync(2000);
		expect(handler).toHaveBeenCalledTimes(2);
	});

	it("skips the pending resync when a reconnect reconcile lands after the drop and already covers it", async () => {
		const reconciler = await freshReconciler();
		const handler = vi.fn();
		reconciler.subscribe(handler);

		dropEvents(3);
		await flushMockSubscriptions();
		expect(handler).toHaveBeenCalledTimes(1);

		await vi.advanceTimersByTimeAsync(1200);
		dropEvents(7);

		await vi.advanceTimersByTimeAsync(800);
		reconnect();
		reconnect();
		await flushMockSubscriptions();
		expect(handler).toHaveBeenCalledTimes(2);

		await vi.advanceTimersByTimeAsync(2000);
		expect(handler).toHaveBeenCalledTimes(2);
	});
});

describe("Reconciler on returning to the app", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
		isMobilePlatformMock.mockReturnValue(false);
	});

	it("leaves desktop data alone when the window was hidden for under five minutes", async () => {
		const reconciler = await freshReconciler();
		const handler = vi.fn();
		reconciler.subscribe(handler);

		await hideFor(5 * MINUTE_MS - SECOND_MS);

		expect(handler).not.toHaveBeenCalled();
	});

	it("reconciles on desktop once the window was hidden for five minutes", async () => {
		const reconciler = await freshReconciler();
		const handler = vi.fn();
		reconciler.subscribe(handler);

		await hideFor(5 * MINUTE_MS);

		expect(handler).toHaveBeenCalledTimes(1);
	});

	it("measures each desktop absence on its own instead of adding short ones up", async () => {
		const reconciler = await freshReconciler();
		const handler = vi.fn();
		reconciler.subscribe(handler);

		await hideFor(3 * MINUTE_MS);
		await vi.advanceTimersByTimeAsync(10 * MINUTE_MS);
		await hideFor(3 * MINUTE_MS);
		expect(handler).not.toHaveBeenCalled();

		await hideFor(5 * MINUTE_MS);
		expect(handler).toHaveBeenCalledTimes(1);
	});

	it("reconciles on mobile after any absence, however short", async () => {
		isMobilePlatformMock.mockReturnValue(true);
		const reconciler = await freshReconciler();
		const handler = vi.fn();
		reconciler.subscribe(handler);

		await hideFor(3 * SECOND_MS);

		expect(handler).toHaveBeenCalledTimes(1);
	});

	it("reconciles a hidden desktop window on a websocket reconnect and not again on a quick return", async () => {
		const reconciler = await freshReconciler();
		const handler = vi.fn();
		reconciler.subscribe(handler);
		reconnect();

		setVisibility("hidden");
		await vi.advanceTimersByTimeAsync(30 * SECOND_MS);
		reconnect();
		await flushMockSubscriptions();
		expect(handler).toHaveBeenCalledTimes(1);

		await vi.advanceTimersByTimeAsync(3 * SECOND_MS);
		setVisibility("visible");
		await flushMockSubscriptions();
		expect(handler).toHaveBeenCalledTimes(1);
	});
});
