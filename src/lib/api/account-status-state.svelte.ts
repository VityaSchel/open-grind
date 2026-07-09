import type { BanInfo, Restriction } from "$lib/api";

export type AccountStatus =
	| { kind: "banned"; info: BanInfo }
	| { kind: "restriction"; restriction: Restriction };

export const accountStatusState = $state<{
	open: boolean;
	status: AccountStatus | null;
}>({ open: false, status: null });

export function showAccountRestriction(
	restriction: Restriction | null | undefined,
): boolean {
	if (!restriction) return false;
	accountStatusState.status = { kind: "restriction", restriction };
	accountStatusState.open = true;
	return true;
}
