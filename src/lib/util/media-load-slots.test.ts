import { describe, expect, it, vi } from "vitest";

import { LoadSlots, mediaLoadCapacity } from "./media-load-slots";

describe("mediaLoadCapacity", () => {
	it("leaves one of the Android WebView intercept workers free", () => {
		expect(mediaLoadCapacity({ platform: "android", cores: 8 })).toBe(5);
		expect(mediaLoadCapacity({ platform: "android", cores: 12 })).toBe(9);
	});

	it("keeps the three-worker floor on phones with few cores", () => {
		expect(mediaLoadCapacity({ platform: "android", cores: 4 })).toBe(2);
		expect(mediaLoadCapacity({ platform: "android", cores: 1 })).toBe(2);
	});

	it.each(["ios", "linux", "macos", "windows"] as const)(
		"does not limit loads on %s",
		(platform) => {
			expect(mediaLoadCapacity({ platform, cores: 8 })).toBe(
				Number.POSITIVE_INFINITY,
			);
		},
	);
});

describe("LoadSlots", () => {
	it("grants a free slot synchronously", () => {
		const slots = new LoadSlots(1);
		const grant = vi.fn();

		slots.acquire(grant);

		expect(grant).toHaveBeenCalledOnce();
	});

	it("queues requests beyond capacity until a slot is released", () => {
		const slots = new LoadSlots(1);
		const release = slots.acquire(() => {});
		const waiting = vi.fn();

		slots.acquire(waiting);
		expect(waiting).not.toHaveBeenCalled();

		release();
		expect(waiting).toHaveBeenCalledOnce();
	});

	it("grants waiters in the order they asked", () => {
		const slots = new LoadSlots(1);
		const release = slots.acquire(() => {});
		const granted: string[] = [];
		const releaseFirst = slots.acquire(() => granted.push("first"));
		slots.acquire(() => granted.push("second"));

		release();
		expect(granted).toEqual(["first"]);

		releaseFirst();
		expect(granted).toEqual(["first", "second"]);
	});

	it("frees only one slot however many times it is released", () => {
		const slots = new LoadSlots(1);
		const release = slots.acquire(() => {});
		const releaseFirst = slots.acquire(() => {});
		const second = vi.fn();
		slots.acquire(second);

		release();
		release();

		expect(second).not.toHaveBeenCalled();

		releaseFirst();
		expect(second).toHaveBeenCalledOnce();
	});

	it("drops a cancelled waiter from the queue", () => {
		const slots = new LoadSlots(1);
		const release = slots.acquire(() => {});
		const cancelled = vi.fn();
		const cancel = slots.acquire(cancelled);
		const next = vi.fn();
		slots.acquire(next);

		cancel();
		release();

		expect(cancelled).not.toHaveBeenCalled();
		expect(next).toHaveBeenCalledOnce();
	});

	it("does not spend a slot on a waiter cancelled before its turn", () => {
		const slots = new LoadSlots(1);
		const release = slots.acquire(() => {});
		slots.acquire(() => {})();

		release();
		const later = vi.fn();
		slots.acquire(later);

		expect(later).toHaveBeenCalledOnce();
	});

	it("never queues with unlimited capacity", () => {
		const slots = new LoadSlots(Number.POSITIVE_INFINITY);
		const grants = Array.from({ length: 100 }, () => vi.fn());

		for (const grant of grants) slots.acquire(grant);

		for (const grant of grants) expect(grant).toHaveBeenCalledOnce();
	});
});
