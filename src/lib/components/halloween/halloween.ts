import { createSubscriber } from "svelte/reactivity";
import type { IconWeight } from "phosphor-svelte";
import type { ClassValue } from "svelte/elements";

const STARTS_AT = Date.UTC(2026, 9, 31, 12);
const ENDS_AT = Date.UTC(2026, 10, 1, 6);
const MAX_WAIT_MS = 3_600_000;

export type HalloweenIconProps = {
	class?: ClassValue;
	weight?: IconWeight;
	"aria-hidden"?: "true";
	"data-slot"?: string;
};

const subscribe = createSubscriber((update) => {
	let timeout: ReturnType<typeof setTimeout> | undefined;
	function waitForNextBoundary() {
		const now = Date.now();
		const boundary = [STARTS_AT, ENDS_AT].find((at) => at > now);
		if (boundary === undefined) return;
		timeout = setTimeout(
			() => {
				update();
				waitForNextBoundary();
			},
			Math.min(boundary - now, MAX_WAIT_MS),
		);
	}
	waitForNextBoundary();
	return () => clearTimeout(timeout);
});

export function isHalloween(): boolean {
	subscribe();
	const now = Date.now();
	return now >= STARTS_AT && now < ENDS_AT;
}
