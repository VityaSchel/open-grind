import { registerAccountCache } from "$lib/api/account-caches";
import { now } from "$lib/util/clock";

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
