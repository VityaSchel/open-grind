type Tombstone = { refs: number; inFlight: number; lastSettledEpoch: number };

export class PendingDeletes {
	#tombstones = new Map<string, Tombstone>();

	mark(conversationId: string): void {
		const tombstone = this.#tombstones.get(conversationId) ?? {
			refs: 0,
			inFlight: 0,
			lastSettledEpoch: -1,
		};
		tombstone.refs += 1;
		tombstone.inFlight += 1;
		this.#tombstones.set(conversationId, tombstone);
	}

	settle({
		conversationId,
		fetchEpoch,
	}: {
		conversationId: string;
		fetchEpoch: number;
	}): void {
		const tombstone = this.#tombstones.get(conversationId);
		if (tombstone === undefined) return;
		tombstone.inFlight -= 1;
		tombstone.lastSettledEpoch = fetchEpoch;
	}

	release(conversationId: string): void {
		const tombstone = this.#tombstones.get(conversationId);
		if (tombstone === undefined) return;
		tombstone.refs -= 1;
		if (tombstone.refs === 0) this.#tombstones.delete(conversationId);
	}

	blocks({
		conversationId,
		fetchEpoch,
	}: {
		conversationId: string;
		fetchEpoch: number;
	}): boolean {
		const tombstone = this.#tombstones.get(conversationId);
		if (tombstone === undefined) return false;
		return (
			tombstone.inFlight > 0 || fetchEpoch <= tombstone.lastSettledEpoch
		);
	}
}
