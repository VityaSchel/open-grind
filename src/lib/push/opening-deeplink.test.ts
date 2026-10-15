import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
	untilPushDeeplinkOpened,
	whileOpeningPushDeeplink,
} from "./opening-deeplink";

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	vi.useRealTimers();
});

describe("untilPushDeeplinkOpened", () => {
	it("settles once a notification finished opening and drops its deadline", async () => {
		const settled = vi.fn();
		void untilPushDeeplinkOpened({ ms: 5000 }).then(settled);

		await whileOpeningPushDeeplink(() => Promise.resolve());
		await vi.advanceTimersByTimeAsync(0);

		expect(settled).toHaveBeenCalledOnce();
		expect(vi.getTimerCount()).toBe(0);
	});

	it("settles at the deadline when no notification opens", async () => {
		const settled = vi.fn();
		void untilPushDeeplinkOpened({ ms: 5000 }).then(settled);

		await vi.advanceTimersByTimeAsync(4999);
		expect(settled).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(1);
		expect(settled).toHaveBeenCalledOnce();
	});
});
