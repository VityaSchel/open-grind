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
		expect(button.pointerOnly).toBe(false);
		vi.advanceTimersByTime(PROBE_MS);

		expect(button.pointerOnly).toBe(true);
	});

	it("cancels the probe when the band moves before it fires", () => {
		const button = new RestingButtonModel({ probeMs: PROBE_MS });

		button.probePointer();
		vi.advanceTimersByTime(PROBE_MS - 1);
		button.leaveBoundary();
		vi.advanceTimersByTime(PROBE_MS);

		expect(button.pointerOnly).toBe(false);
	});

	it("stops trusting the pointer for good once the band moves", () => {
		const button = new RestingButtonModel({ probeMs: PROBE_MS });

		button.leaveBoundary();
		button.probePointer();
		vi.advanceTimersByTime(PROBE_MS);

		expect(button.pointerOnly).toBe(false);
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

		expect(button.pointerOnly).toBe(false);
	});
});
