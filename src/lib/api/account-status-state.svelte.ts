import type { BanInfo, Restriction } from "$lib/api";

export type AccountStatus =
	| { kind: "banned"; info: BanInfo }
	| { kind: "restriction"; restriction: Restriction };

export const accountStatusState = $state<{
	open: boolean;
	status: AccountStatus | null;
}>({ open: false, status: null });
