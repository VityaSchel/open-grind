import { describe, expect, it } from "vitest";

import {
	accountEpoch,
	accountScoped,
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

describe("accountScoped", () => {
	function scopedCounter() {
		const destroyed: number[] = [];
		const get = accountScoped((profileId: number) => ({
			profileId,
			destroy: () => destroyed.push(profileId),
		}));
		return { destroyed, get };
	}

	it("reuses one instance per account", () => {
		const { destroyed, get } = scopedCounter();

		expect(get(1)).toBe(get(1));
		expect(destroyed).toEqual([]);
	});

	it("destroys the previous instance when the account changes", () => {
		const { destroyed, get } = scopedCounter();

		const first = get(1);
		const second = get(2);

		expect(second).not.toBe(first);
		expect(destroyed).toEqual([1]);
	});

	it("destroys and rebuilds across a cache clear", () => {
		const { destroyed, get } = scopedCounter();

		const first = get(1);
		clearAccountCaches();

		expect(destroyed).toEqual([1]);
		expect(get(1)).not.toBe(first);
		expect(destroyed).toEqual([1]);
	});
});
