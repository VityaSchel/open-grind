const resets = new Set<() => void>();

export function registerAccountCache(reset: () => void): void {
	resets.add(reset);
}

export function clearAccountCaches(): void {
	for (const reset of resets) {
		try {
			reset();
		} catch (error) {
			console.error("Account cache reset failed", error);
		}
	}
}
