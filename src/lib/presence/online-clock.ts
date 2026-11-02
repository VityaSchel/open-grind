import { registerAccountCache } from "#lib/api/account-caches.ts";
import { now } from "#lib/util/clock.ts";

let refreshedAt: number | null = null;

export function markOnlineRefreshed(): void {
	refreshedAt = now();
}

export function onlineRefreshedAt(): number | null {
	return refreshedAt;
}

registerAccountCache({
	reset: () => {
		refreshedAt = null;
	},
});
