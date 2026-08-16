import { afterEach, describe, expect, it } from "vitest";

import { clearAccountCaches } from "$lib/api/account-caches";
import { cachedFetch, FetchCache, TtlCache } from "$lib/api/cache";
import { resetNowForTesting, setNowForTesting } from "$lib/util/clock";

afterEach(() => {
	resetNowForTesting();
});

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((res) => {
		resolve = res;
	});
	return { promise, resolve };
}

describe("TtlCache", () => {
	it("serves a value until the ttl elapses", () => {
		let clock = 1_000;
		setNowForTesting(() => clock);
		const cache = new TtlCache<string, string>({ ttlMs: 60_000 });

		cache.set("k", "v");
		clock += 59_999;
		expect(cache.get("k")).toBe("v");

		clock += 1;
		expect(cache.get("k")).toBeNull();
	});

	it("keeps a value indefinitely without a ttl", () => {
		let clock = 1_000;
		setNowForTesting(() => clock);
		const cache = new TtlCache<string, string>();

		cache.set("k", "v");
		clock += 1_000_000_000;
		expect(cache.get("k")).toBe("v");
	});

	it("patches a stored value even after its ttl elapsed", () => {
		let clock = 1_000;
		setNowForTesting(() => clock);
		const cache = new TtlCache<string, string>({ ttlMs: 60_000 });

		cache.set("k", "v");
		clock += 60_000;
		cache.update("k", (value) => `${value}!`);

		expect(cache.get("k")).toBe("v!");
	});

	it("ignores an update for a key it never stored", () => {
		const cache = new TtlCache<string, string>();

		cache.update("k", () => "v");

		expect(cache.get("k")).toBeNull();
	});

	it("forgets a deleted key", () => {
		const cache = new TtlCache<string, string>();

		cache.set("k", "v");
		cache.delete("k");

		expect(cache.get("k")).toBeNull();
	});

	it("is emptied when the account changes", () => {
		const cache = new TtlCache<string, string>();

		cache.set("k", "v");
		clearAccountCaches();

		expect(cache.get("k")).toBeNull();
	});
});

describe("FetchCache", () => {
	it("fetches once and serves the rest from the cache", async () => {
		let calls = 0;
		const cache = new FetchCache<string, string>(() => {
			calls += 1;
			return Promise.resolve("v");
		});

		expect(await cache.fetch("k")).toBe("v");
		expect(await cache.fetch("k")).toBe("v");
		expect(calls).toBe(1);
	});

	it("shares one request between concurrent callers", async () => {
		let calls = 0;
		const pending = deferred<string>();
		const cache = new FetchCache<string, string>(() => {
			calls += 1;
			return pending.promise;
		});

		const [first, second] = [cache.fetch("k"), cache.fetch("k")];
		pending.resolve("v");

		expect(await first).toBe("v");
		expect(await second).toBe("v");
		expect(calls).toBe(1);
	});

	it("keys requests separately", async () => {
		const cache = new FetchCache<string, string>((key) =>
			Promise.resolve(key.toUpperCase()),
		);

		expect(await cache.fetch("a")).toBe("A");
		expect(await cache.fetch("b")).toBe("B");
	});

	it("does not cache a failed fetch", async () => {
		let calls = 0;
		const cache = new FetchCache<string, string>(() => {
			calls += 1;
			return Promise.reject(new Error("nope"));
		});

		await expect(cache.fetch("k")).rejects.toThrow("nope");
		await expect(cache.fetch("k")).rejects.toThrow("nope");
		expect(calls).toBe(2);
	});

	it("drops a value that arrives after the account changed", async () => {
		const pending = deferred<string>();
		const cache = new FetchCache<string, string>(() => pending.promise);

		const request = cache.fetch("k");
		clearAccountCaches();
		pending.resolve("previous account");
		await request;

		expect(cache.get("k")).toBeNull();
	});

	it("starts a new request for the next account instead of joining the previous one", async () => {
		const first = deferred<string>();
		const second = deferred<string>();
		const pending = [first, second];
		let calls = 0;
		const cache = new FetchCache<string, string>(() => {
			const next = pending[calls++];
			if (!next) throw new Error("more fetches than deferred fixtures");
			return next.promise;
		});

		const previous = cache.fetch("k");
		clearAccountCaches();
		const current = cache.fetch("k");
		first.resolve("previous account");
		second.resolve("current account");

		expect(await previous).toBe("previous account");
		expect(await current).toBe("current account");
		expect(calls).toBe(2);
	});

	it("keeps the pending request when one from the previous account settles", async () => {
		const first = deferred<string>();
		const pending = [first, deferred<string>(), deferred<string>()];
		let calls = 0;
		const cache = new FetchCache<string, string>(() => {
			const next = pending[calls++];
			if (!next) throw new Error("more fetches than deferred fixtures");
			return next.promise;
		});

		const previous = cache.fetch("k");
		clearAccountCaches();
		void cache.fetch("k");
		first.resolve("previous account");
		await previous;
		void cache.fetch("k");

		expect(calls).toBe(2);
	});

	it("serves a value written through the cache without fetching", async () => {
		let calls = 0;
		const cache = new FetchCache<string, string>(() => {
			calls += 1;
			return Promise.resolve("fetched");
		});

		cache.set("k", "written");

		expect(await cache.fetch("k")).toBe("written");
		expect(calls).toBe(0);
	});
});

describe("cachedFetch", () => {
	it("fetches once and refetches for the next account", async () => {
		let calls = 0;
		const get = cachedFetch(() => {
			calls += 1;
			return Promise.resolve(["a"]);
		});

		expect(await get()).toEqual(["a"]);
		expect(await get()).toEqual(["a"]);
		expect(calls).toBe(1);

		clearAccountCaches();
		await get();
		expect(calls).toBe(2);
	});

	it("expires on its ttl", async () => {
		let clock = 1_000;
		setNowForTesting(() => clock);
		let calls = 0;
		const get = cachedFetch(
			() => {
				calls += 1;
				return Promise.resolve(["a"]);
			},
			{ ttlMs: 5_000 },
		);

		await get();
		clock += 4_999;
		await get();
		expect(calls).toBe(1);

		clock += 1;
		await get();
		expect(calls).toBe(2);
	});

	it("does not let a request that spans clear() repopulate the cache", async () => {
		const { promise, resolve } = Promise.withResolvers<string[]>();
		const cache = new FetchCache<null, string[]>(() => promise);

		const inFlight = cache.fetch(null);
		cache.clear();
		resolve(["stale"]);
		await inFlight;

		expect(cache.get(null)).toBeNull();
	});

	it("does not let a request that spans delete() repopulate the cache", async () => {
		const { promise, resolve } = Promise.withResolvers<string[]>();
		const cache = new FetchCache<null, string[]>(() => promise);

		const inFlight = cache.fetch(null);
		cache.delete(null);
		resolve(["stale"]);
		await inFlight;

		expect(cache.get(null)).toBeNull();
	});
});
