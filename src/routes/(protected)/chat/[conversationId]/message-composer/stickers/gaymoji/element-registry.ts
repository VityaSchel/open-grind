import type { Attachment } from "svelte/attachments";

export class ElementRegistry<T extends Element> {
	#elements = new Map<string, T>();

	get(key: string): T | undefined {
		return this.#elements.get(key);
	}

	register(key: string): Attachment<T> {
		return (element) => {
			this.#elements.set(key, element);
			return () => {
				if (this.#elements.get(key) === element)
					this.#elements.delete(key);
			};
		};
	}
}
