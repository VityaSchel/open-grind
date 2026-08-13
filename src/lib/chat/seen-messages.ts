const DEFAULT_CAPACITY = 1000;

export class SeenMessages {
	#ids = new Set<string>();
	#capacity: number;

	constructor({ capacity = DEFAULT_CAPACITY }: { capacity?: number } = {}) {
		this.#capacity = capacity;
	}

	has(messageId: string): boolean {
		return this.#ids.has(messageId);
	}

	mark(messageId: string): void {
		this.#ids.add(messageId);
		while (this.#ids.size > this.#capacity) {
			const oldest = this.#ids.values().next();
			if (oldest.done) return;
			this.#ids.delete(oldest.value);
		}
	}

	unmark(messageId: string): void {
		this.#ids.delete(messageId);
	}
}
