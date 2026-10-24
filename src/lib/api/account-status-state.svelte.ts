import { SvelteSet } from "svelte/reactivity";

import { registerAccountCache } from "$lib/api/account-caches";
import type { BanInfo, Restriction } from "$lib/api/methods";
import type {
	AccountStatusError,
	DeprecatedClientVersionError,
	VerificationRequiredError,
} from "$lib/model/authentication";

export type AccountStatus =
	| { kind: "banned"; info: BanInfo }
	| { kind: "restriction"; restriction: Restriction }
	| { kind: "phoneVerificationRequired"; error: VerificationRequiredError }
	| { kind: "unsupportedVersion"; error: DeprecatedClientVersionError };

export const accountStatusState = $state<{
	open: boolean;
	status: AccountStatus | null;
}>({ open: false, status: null });

const dismissedKinds = new SvelteSet<AccountStatus["kind"]>();

registerAccountCache({
	reset: () => {
		accountStatusState.open = false;
		accountStatusState.status = null;
		dismissedKinds.clear();
	},
});

export function showAccountStatus(status: AccountStatus): void {
	accountStatusState.status = status;
	accountStatusState.open = true;
}

export function showAccountRestriction(
	restriction: Restriction | null | undefined,
): boolean {
	if (!restriction) return false;
	showAccountStatus({ kind: "restriction", restriction });
	return true;
}

function accountStatusOf(error: AccountStatusError): AccountStatus {
	return error.code === 30
		? { kind: "phoneVerificationRequired", error }
		: { kind: "unsupportedVersion", error };
}

export function showAccountStatusForError(error: AccountStatusError): void {
	showAccountStatus(accountStatusOf(error));
}

export function noticeAccountStatusError(error: AccountStatusError): void {
	const status = accountStatusOf(error);
	if (accountStatusState.open || dismissedKinds.has(status.kind)) return;
	showAccountStatus(status);
}

export function dismissAccountStatus(): void {
	const kind = accountStatusState.status?.kind;
	if (kind) dismissedKinds.add(kind);
	accountStatusState.open = false;
}
