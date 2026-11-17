import { afterEach, beforeEach, vi } from "vitest";

let clock = 1_700_000_000_000;

export function useHoldClock(): void {
	beforeEach(() => {
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
		vi.setSystemTime((clock += 60_000));
	});
	afterEach(() => {
		window.dispatchEvent(new Event("pointerup"));
		vi.useRealTimers();
	});
}
