import { SvelteSet } from "svelte/reactivity";

import { registerAccountCache } from "$lib/api/account-caches";
import type { BanInfo, Restriction } from "$lib/api/methods";

export type ApiErrorBody = { code: number; message: string };

export type AccountStatus =
	| { kind: "banned"; info: BanInfo }
	| { kind: "restriction"; restriction: Restriction }
	| { kind: "phoneVerificationRequired"; error: ApiErrorBody }
	| { kind: "unsupportedVersion"; error: ApiErrorBody };

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

function accountStatusOfApiError(error: ApiErrorBody): AccountStatus | null {
	if (error.code === 30) return { kind: "phoneVerificationRequired", error };
	if (error.code === 8) return { kind: "unsupportedVersion", error };
	return null;
}

export function showAccountStatusForApiError(error: ApiErrorBody): boolean {
	const status = accountStatusOfApiError(error);
	if (!status) return false;
	showAccountStatus(status);
	return true;
}

export function noticeAccountStatusInResponse(error: ApiErrorBody): void {
	const status = accountStatusOfApiError(error);
	if (!status) return;
	if (accountStatusState.open || dismissedKinds.has(status.kind)) return;
	showAccountStatus(status);
}

export function dismissAccountStatus(): void {
	const kind = accountStatusState.status?.kind;
	if (kind) dismissedKinds.add(kind);
	accountStatusState.open = false;
}
