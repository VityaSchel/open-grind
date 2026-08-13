export class UnreadWhileMissing {
	#counts = new Map<string, number>();

	add(conversationId: string): void {
		this.#counts.set(
			conversationId,
			(this.#counts.get(conversationId) ?? 0) + 1,
		);
	}

	drop(conversationId: string): void {
		const count = this.#counts.get(conversationId);
		if (count === undefined) return;
		if (count > 1) {
			this.#counts.set(conversationId, count - 1);
			return;
		}
		this.#counts.delete(conversationId);
	}

	take(conversationId: string): number {
		const count = this.#counts.get(conversationId) ?? 0;
		this.#counts.delete(conversationId);
		return count;
	}
}
