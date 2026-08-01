import { describe, expect, it } from "vitest";

import {
	accountEpoch,
	clearAccountCaches,
	isAccountEpochCurrent,
	registerAccountCache,
} from "./account-caches";

describe("account cache epoch", () => {
	it("invalidates an epoch captured before a clear", () => {
		const captured = accountEpoch();
		expect(isAccountEpochCurrent(captured)).toBe(true);
		clearAccountCaches();
		expect(isAccountEpochCurrent(captured)).toBe(false);
	});

	it("keeps an epoch captured after the clear valid", () => {
		clearAccountCaches();
		const captured = accountEpoch();
		expect(isAccountEpochCurrent(captured)).toBe(true);
	});

	it("drops a write from a request that was in flight across a sign-out", async () => {
		let cache: string | null = null;
		registerAccountCache({
			reset: () => {
				cache = null;
			},
		});

		const load = async (value: string) => {
			const epoch = accountEpoch();
			await Promise.resolve();
			if (isAccountEpochCurrent(epoch)) cache = value;
		};

		const inFlight = load("previous account");
		clearAccountCaches();
		await inFlight;

		expect(cache).toBeNull();
	});

	it("still caches when no clear intervenes", async () => {
		let cache: string | null = null;
		const load = async (value: string) => {
			const epoch = accountEpoch();
			await Promise.resolve();
			if (isAccountEpochCurrent(epoch)) cache = value;
		};

		await load("same account");

		expect(cache).toBe("same account");
	});
});
