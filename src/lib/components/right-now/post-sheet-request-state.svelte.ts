import { goto } from "$app/navigation";
import { page } from "$app/state";

import { registerAccountCache } from "#lib/api/account-caches.ts";

const RIGHT_NOW_PATH = "/right-now";

let pending = $state(false);

registerAccountCache({ reset: () => (pending = false) });

export const rightNowPostSheetRequest = {
	get pending(): boolean {
		return pending;
	},
	request(): void {
		pending = true;
		if (page.url.pathname === RIGHT_NOW_PATH) return;
		void goto(RIGHT_NOW_PATH)
			.catch((error: unknown) => console.error(error))
			.finally(() => {
				if (page.url.pathname !== RIGHT_NOW_PATH) pending = false;
			});
	},
	take(): boolean {
		const requested = pending;
		pending = false;
		return requested;
	},
};
