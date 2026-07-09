const TICK_MS = 30_000;

let now = $state(Date.now());
let subscribers = 0;
let interval: ReturnType<typeof setInterval> | null = null;

export function getNow(): number {
	return now;
}

export function subscribeNow(): () => void {
	subscribers += 1;
	if (interval === null) {
		now = Date.now();
		interval = setInterval(() => {
			now = Date.now();
		}, TICK_MS);
	}
	return () => {
		subscribers -= 1;
		if (subscribers === 0 && interval !== null) {
			clearInterval(interval);
			interval = null;
		}
	};
}
