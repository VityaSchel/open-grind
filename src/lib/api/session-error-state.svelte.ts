import { registerAccountCache } from "$lib/api/account-caches";

export type SessionErrorKind =
	| "Http"
	| "RateLimited"
	| "RequestBlocked"
	| "NetworkBlocked"
	| "Unauthorized"
	| "Auth"
	| "Api"
	| "Banned"
	| "NotLoggedIn";

export const sessionErrorState = $state<{
	open: boolean;
	message: string;
	unauthorized: boolean;
	kind: SessionErrorKind;
	attempts: number;
}>({
	open: false,
	message: "",
	unauthorized: false,
	kind: "Http",
	attempts: 0,
});

export function clearSessionError(): void {
	sessionErrorState.open = false;
	sessionErrorState.message = "";
	sessionErrorState.unauthorized = false;
	sessionErrorState.kind = "Http";
	sessionErrorState.attempts = 0;
}

registerAccountCache({ reset: clearSessionError });
