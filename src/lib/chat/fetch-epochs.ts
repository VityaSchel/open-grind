export class FetchEpochs {
	#current = 0;
	#inFlight = new Set<Promise<unknown>>();

	get current(): number {
		return this.#current;
	}

	claim(): number {
		return ++this.#current;
	}

	isStale(fetchEpoch: number): boolean {
		return fetchEpoch !== this.#current;
	}

	track<T>(fetch: Promise<T>): Promise<T> {
		this.#inFlight.add(fetch);
		void fetch.catch(() => {}).finally(() => this.#inFlight.delete(fetch));
		return fetch;
	}

	afterInFlight(run: () => void): void {
		void Promise.allSettled([...this.#inFlight]).then(run);
	}
}
