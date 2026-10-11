export class Generation {
	#current = 0;

	get current(): number {
		return this.#current;
	}

	next(): number {
		return ++this.#current;
	}

	isStale(generation: number): boolean {
		return generation !== this.#current;
	}
}
