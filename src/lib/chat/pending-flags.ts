export class PendingFlags<Field extends string> {
	#counts = new Map<string, Map<Field, number>>();

	mark({
		conversationId,
		field,
	}: {
		conversationId: string;
		field: Field;
	}): void {
		const counts =
			this.#counts.get(conversationId) ?? new Map<Field, number>();
		counts.set(field, (counts.get(field) ?? 0) + 1);
		this.#counts.set(conversationId, counts);
	}

	unmark({
		conversationId,
		field,
	}: {
		conversationId: string;
		field: Field;
	}): void {
		const counts = this.#counts.get(conversationId);
		const count = counts?.get(field);
		if (counts === undefined || count === undefined) return;
		if (count > 1) {
			counts.set(field, count - 1);
			return;
		}
		counts.delete(field);
		if (counts.size === 0) this.#counts.delete(conversationId);
	}

	fields(conversationId: string): Field[] {
		return [...(this.#counts.get(conversationId)?.keys() ?? [])];
	}
}
