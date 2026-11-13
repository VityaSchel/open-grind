import { isAccountEpochCurrent } from "#lib/api/account-caches.ts";
import { getPreferences } from "#lib/app-data/preferences.svelte.ts";
import { atHomeLocation } from "#lib/entitlements/honduras-hold.ts";
import { storeLocation } from "#lib/grid/grid.ts";

class SignedOutBeforeRightNowRequest extends Error {}

export function atStoredLocation<T>({
	epoch,
	onGeohash,
	request,
}: {
	epoch: number;
	onGeohash?: (geohash: string | null) => void;
	request: () => Promise<T>;
}): Promise<T> {
	return atHomeLocation(async () => {
		if (!isAccountEpochCurrent(epoch))
			throw new SignedOutBeforeRightNowRequest();
		const { geohash } = await getPreferences();
		onGeohash?.(geohash);
		if (geohash !== null) await storeLocation({ geohash });
		return request();
	});
}
