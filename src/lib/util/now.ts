import { createSubscriber } from "svelte/reactivity";

const TICK_MS = 30_000;

let now = Date.now();

const subscribe = createSubscriber((update) => {
	now = Date.now();
	const interval = setInterval(() => {
		now = Date.now();
		update();
	}, TICK_MS);
	return () => clearInterval(interval);
});

export function getNow(): number {
	subscribe();
	return now;
}
