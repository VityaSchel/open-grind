const listeners = new Set<() => void>();

export function onInboxResync(listener: () => void): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

export function requestInboxResync(): void {
	for (const listener of listeners) listener();
}
