import { registerAccountCache } from "$lib/api/account-caches";

export const requestBlockedAlertState = $state({ open: false, disable: false });

registerAccountCache({
	reset: () => {
		requestBlockedAlertState.open = false;
		requestBlockedAlertState.disable = false;
	},
});
