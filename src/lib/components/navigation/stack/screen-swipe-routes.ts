import { currentPlatform, type SupportedPlatform } from "#lib/platform/os.ts";
import { isWithin } from "#lib/util/pathname.ts";

const PROFILE_ROUTE = "/(protected)/(navbar)/profile/[profileId]";

const SETTINGS_SUBPAGE_ROUTES = "/(protected)/(navbar)/settings/(subpage)/";
const SETTINGS = "/settings";

function entersSwipeableScreen({
	fromPath,
	toRoute,
}: {
	fromPath: string;
	toRoute: string | null;
}): boolean {
	if (toRoute === PROFILE_ROUTE) return true;
	return (
		toRoute?.startsWith(SETTINGS_SUBPAGE_ROUTES) === true &&
		!isWithin({ pathname: fromPath, root: SETTINGS })
	);
}

export function capturesScreen({
	fromPath,
	toRoute,
	platform = currentPlatform(),
}: {
	fromPath: string;
	toRoute: string | null;
	platform?: SupportedPlatform;
}): boolean {
	switch (platform) {
		case "android":
		case "ios":
			return entersSwipeableScreen({ fromPath, toRoute });
		case "linux":
		case "macos":
		case "windows":
			return false;
	}
}
