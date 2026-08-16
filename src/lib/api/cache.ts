import {
	accountEpoch,
	isAccountEpochCurrent,
	registerAccountCache,
} from "$lib/api/account-caches";
import { now } from "$lib/util/clock";

type CacheOptions = { ttlMs?: number };

type CachedValue = NonNullable<unknown>;

export class TtlCache<K, V extends CachedValue> {
	#entries = new Map<K, { value: V; storedAt: number }>();
	#ttlMs: number;
	protected generation = 0;

	constructor({ ttlMs = Number.POSITIVE_INFINITY }: CacheOptions = {}) {
		this.#ttlMs = ttlMs;
		registerAccountCache({ reset: () => this.clear() });
	}

	get(key: K): V | null {
		const entry = this.#entries.get(key);
		if (!entry) return null;
		if (now() - entry.storedAt >= this.#ttlMs) {
			this.#entries.delete(key);
			return null;
		}
		return entry.value;
	}

	set(key: K, value: V): void {
		this.#entries.set(key, { value, storedAt: now() });
	}

	update(key: K, patch: (value: V) => V): void {
		const entry = this.#entries.get(key);
		if (entry) this.set(key, patch(entry.value));
	}

	delete(key: K): void {
		this.#entries.delete(key);
		this.generation += 1;
	}

	clear(): void {
		this.generation += 1;
		this.#entries.clear();
	}
}

export class FetchCache<K, V extends CachedValue> extends TtlCache<K, V> {
	#inFlight = new Map<K, Promise<V>>();
	#fetch: (key: K) => Promise<V>;

	constructor(fetch: (key: K) => Promise<V>, options?: CacheOptions) {
		super(options);
		this.#fetch = fetch;
	}

	async fetch(key: K): Promise<V> {
		const cached = this.get(key);
		if (cached !== null) return cached;
		const pending = this.#inFlight.get(key);
		if (pending) return pending;
		const epoch = accountEpoch();
		const generation = this.generation;
		const request: Promise<V> = this.#fetch(key)
			.then((value) => {
				if (
					isAccountEpochCurrent(epoch) &&
					generation === this.generation
				)
					this.set(key, value);
				return value;
			})
			.finally(() => {
				if (this.#inFlight.get(key) === request)
					this.#inFlight.delete(key);
			});
		this.#inFlight.set(key, request);
		return await request;
	}

	override delete(key: K): void {
		super.delete(key);
		this.#inFlight.delete(key);
	}

	override clear(): void {
		super.clear();
		this.#inFlight.clear();
	}
}

export function cachedFetch<V extends CachedValue>(
	fetch: () => Promise<V>,
	options?: CacheOptions,
): () => Promise<V> {
	const cache = new FetchCache<null, V>(fetch, options);
	return () => cache.fetch(null);
}
