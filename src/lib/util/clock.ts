let clock: () => number = () => Date.now();

export function now(): number {
	return clock();
}

export function setNowForTesting(fn: () => number): void {
	clock = fn;
}

export function resetNowForTesting(): void {
	clock = () => Date.now();
}
