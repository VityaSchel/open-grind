import { registerAccountCache } from "$lib/api/account-caches";

export const sessionErrorState = $state<{
	open: boolean;
	message: string;
	unauthorized: boolean;
}>({ open: false, message: "", unauthorized: false });

registerAccountCache({
	reset: () => {
		sessionErrorState.open = false;
		sessionErrorState.message = "";
		sessionErrorState.unauthorized = false;
	},
});
