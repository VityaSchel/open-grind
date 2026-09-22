export const INTEREST_TABS = [
	{ href: "/interest/views", label: "Views" },
	{ href: "/interest/taps", label: "Taps" },
];

export function interestTabIndex(pathname: string): number {
	return Math.max(
		0,
		INTEREST_TABS.findIndex(({ href }) => href === pathname),
	);
}
