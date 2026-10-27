import { currentPlatform } from "$lib/platform/os";

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

export function tabChipDetachesAtRest(): boolean {
	switch (currentPlatform()) {
		case "android":
			return true;
		case "ios":
		case "linux":
		case "macos":
		case "windows":
			return false;
	}
}
