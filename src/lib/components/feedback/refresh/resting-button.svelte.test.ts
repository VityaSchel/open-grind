import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RestingButtonModel } from "./resting-button.svelte";

const PROBE_MS = 120;

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	vi.useRealTimers();
});

describe("RestingButtonModel", () => {
	it("treats a wheel that settles at the boundary as a pointer", () => {
		const button = new RestingButtonModel({ probeMs: PROBE_MS });

		button.probePointer();
		expect(button.offered).toBe(false);
		vi.advanceTimersByTime(PROBE_MS);

		expect(button.offered).toBe(true);
	});

	it("cancels the probe when the band moves before it fires", () => {
		const button = new RestingButtonModel({ probeMs: PROBE_MS });

		button.probePointer();
		vi.advanceTimersByTime(PROBE_MS - 1);
		button.leaveBoundary();
		vi.advanceTimersByTime(PROBE_MS);

		expect(button.offered).toBe(false);
	});

	it("drops a pending probe that is cancelled before it fires", () => {
		const button = new RestingButtonModel({ probeMs: PROBE_MS });

		button.probePointer();
		vi.advanceTimersByTime(PROBE_MS - 1);
		button.cancelProbe();
		vi.advanceTimersByTime(PROBE_MS);

		expect(button.offered).toBe(false);
	});

	it("still trusts the next pointer probe after one was cancelled", () => {
		const button = new RestingButtonModel({ probeMs: PROBE_MS });
		button.probePointer();
		button.cancelProbe();

		button.probePointer();
		vi.advanceTimersByTime(PROBE_MS);

		expect(button.offered).toBe(true);
	});

	it("keeps an offer that was already made when a probe is cancelled", () => {
		const button = new RestingButtonModel({ probeMs: PROBE_MS });
		button.offerWithoutPull();

		button.cancelProbe();

		expect(button.offered).toBe(true);
	});

	it("stops trusting the pointer for good once the band moves", () => {
		const button = new RestingButtonModel({ probeMs: PROBE_MS });

		button.leaveBoundary();
		button.probePointer();
		vi.advanceTimersByTime(PROBE_MS);

		expect(button.offered).toBe(false);
	});

	it("offers the button without a pull even after a pull was seen", () => {
		const button = new RestingButtonModel({ probeMs: PROBE_MS });
		button.leaveBoundary();

		button.offerWithoutPull();

		expect(button.offered).toBe(true);
	});

	it("takes the offer back at the next pull", () => {
		const button = new RestingButtonModel({ probeMs: PROBE_MS });
		button.offerWithoutPull();
		button.shown = true;

		button.leaveBoundary();

		expect(button.offered).toBe(false);
		expect(button.shown).toBe(false);
	});

	it("hides the button when the band moves", () => {
		const button = new RestingButtonModel({ probeMs: PROBE_MS });
		button.shown = true;

		button.leaveBoundary();

		expect(button.shown).toBe(false);
	});

	it("drops a pending probe when destroyed", () => {
		const button = new RestingButtonModel({ probeMs: PROBE_MS });

		button.probePointer();
		button.destroy();
		vi.advanceTimersByTime(PROBE_MS);

		expect(button.offered).toBe(false);
	});
});
