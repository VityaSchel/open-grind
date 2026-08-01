const resets = new Set<() => void>();

let epoch = 0;

export function registerAccountCache({ reset }: { reset: () => void }): void {
	resets.add(reset);
}

export function accountEpoch(): number {
	return epoch;
}

export function isAccountEpochCurrent(captured: number): boolean {
	return captured === epoch;
}

export function clearAccountCaches(): void {
	epoch += 1;
	for (const reset of resets) {
		try {
			reset();
		} catch (error) {
			console.error("Account cache reset failed", error);
		}
	}
}
