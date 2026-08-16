import { registerAccountCache } from "$lib/api/account-caches";
import { now } from "$lib/util/clock";

const PROPAGATION_MS = 15_000;

// The server keeps listing a profile as blocked or hidden for a moment after we
// lift it, so a list refetched right after the mutation resurrects the state we
// just cleared.
export function createRecentlyLifted(): {
	remember: (profileId: number) => void;
	has: (profileId: number) => boolean;
} {
	const liftedAt = new Map<number, number>();
	registerAccountCache({ reset: () => liftedAt.clear() });

	return {
		remember: (profileId) => liftedAt.set(profileId, now()),
		has: (profileId) => {
			const at = liftedAt.get(profileId);
			if (at === undefined) return false;
			if (now() - at >= PROPAGATION_MS) {
				liftedAt.delete(profileId);
				return false;
			}
			return true;
		},
	};
}
