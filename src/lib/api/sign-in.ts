import { goto } from "$app/navigation";
import { toast } from "svelte-sonner";

import {
	accountStatusState,
	showAccountRestriction,
} from "$lib/api/account-status-state.svelte";
import { showErrorToast } from "$lib/api/error-toast";
import {
	asAppError,
	asBanned,
	blockedKindOf,
	markRequestBlocked,
	type Restriction,
} from "$lib/api/methods";
import { noticeStorageBackend } from "$lib/api/storage-notice";
import { clearProfileCaches } from "$lib/api/users/profiles";

type AppErrorView = NonNullable<ReturnType<typeof asAppError>>;

export const companionUnavailable = "companion-unavailable";
export const companionUntrusted = "companion-untrusted";
export const untrustedCompanionMessage =
	"An app using the companion's name is installed but isn't signed by Open Grind, so its token was refused. Uninstall it, or paste the OAuth token manually.";

export function finishSignIn(result: {
	restriction?: Restriction | null;
}): void {
	if (showAccountRestriction(result.restriction)) return;
	clearProfileCaches();
	void noticeStorageBackend();
	void goto("/");
}

export function reportSignInFailure({
	error,
	label,
	onAuthFailure = () => false,
	onFailure = () => false,
}: {
	error: unknown;
	label?: string;
	onAuthFailure?: (message: string) => boolean;
	onFailure?: (appError: AppErrorView) => boolean;
}): void {
	console.error(error);
	const appError = asAppError(error);
	const blockedKind = blockedKindOf(appError?.kind);
	if (blockedKind && markRequestBlocked({ kind: blockedKind })) return;
	if (appError?.kind === "Auth" && typeof appError.message === "string") {
		if (appError.message === "Sign-in canceled") return;
		if (appError.message === "account not registered") {
			toast.error(
				"Account not registered in Grindr. Register first using the official Grindr app",
			);
			return;
		}
		if (onAuthFailure(appError.message)) return;
	}
	if (appError && onFailure(appError)) return;
	const ban = asBanned(error);
	if (ban) {
		accountStatusState.status = { kind: "banned", info: ban };
		accountStatusState.open = true;
		return;
	}
	if (appError?.kind === "RateLimited") {
		toast.error("Too many attempts. Please try again later.");
		return;
	}
	if (appError) {
		toast.error(appError.prettyMessage);
		return;
	}
	showErrorToast({ label, error });
}
