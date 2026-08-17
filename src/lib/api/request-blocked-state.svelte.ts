import { registerAccountCache } from "$lib/api/account-caches";

export type RequestBlockKind = "cloudflare" | "network";

export const requestBlockedAlertState = $state<{
	open: boolean;
	disable: boolean;
	kind: RequestBlockKind;
}>({ open: false, disable: false, kind: "cloudflare" });

registerAccountCache({
	reset: () => {
		requestBlockedAlertState.open = false;
		requestBlockedAlertState.disable = false;
		requestBlockedAlertState.kind = "cloudflare";
	},
});
