import { SvelteSet } from "svelte/reactivity";

export class SelectionSet<T> {
	readonly max: number | null;
	#selected = new SvelteSet<T>();

	constructor(max: number | null = null) {
		this.max = max;
	}

	get size(): number {
		return this.#selected.size;
	}

	get canSelectMore(): boolean {
		return this.max === null || this.#selected.size < this.max;
	}

	has(item: T): boolean {
		return this.#selected.has(item);
	}

	add(item: T): void {
		if (this.#selected.has(item) || !this.canSelectMore) return;
		this.#selected.add(item);
	}

	delete(item: T): void {
		this.#selected.delete(item);
	}

	toggle(item: T): void {
		if (this.#selected.has(item)) {
			this.#selected.delete(item);
		} else {
			this.add(item);
		}
	}

	values(): T[] {
		return [...this.#selected];
	}

	clear(): void {
		this.#selected.clear();
	}
}
