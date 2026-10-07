import type { PlainMessageKey } from "$lib/i18n";

export const INTEREST_TABS = [
	{ href: "/interest/views", label: "interest.tabs.views" },
	{ href: "/interest/taps", label: "interest.tabs.taps" },
] as const satisfies readonly { href: string; label: PlainMessageKey }[];

export function interestTabIndex(pathname: string): number {
	return Math.max(
		0,
		INTEREST_TABS.findIndex(({ href }) => href === pathname),
	);
}
