import { Generation } from "$lib/util/generation";

export class FetchEpochs extends Generation {
	#inFlight = new Set<Promise<unknown>>();

	track<T>(fetch: Promise<T>): Promise<T> {
		this.#inFlight.add(fetch);
		void fetch.catch(() => {}).finally(() => this.#inFlight.delete(fetch));
		return fetch;
	}

	afterInFlight(run: () => void): void {
		void Promise.allSettled([...this.#inFlight]).then(run);
	}
}
