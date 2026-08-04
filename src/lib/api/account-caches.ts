const resets = new Set<() => void>();

let epoch = 0;

export function registerAccountCache({ reset }: { reset: () => void }): void {
	resets.add(reset);
}

export function accountScoped<T extends { destroy(): unknown }>(
	create: (profileId: number) => T,
): (profileId: number) => T {
	let cached: T | null = null;
	let cachedProfileId: number | null = null;
	registerAccountCache({
		reset: () => {
			void cached?.destroy();
			cached = null;
			cachedProfileId = null;
		},
	});
	return (profileId) => {
		if (cached !== null && cachedProfileId === profileId) return cached;
		void cached?.destroy();
		cached = create(profileId);
		cachedProfileId = profileId;
		return cached;
	};
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
