import { isPlayBuild } from "#lib/platform/store.ts";
import {
	COMPONENT_REPO,
	FCM_COMPONENT,
	GOOGLE_OAUTH_COMPONENT,
	RECAPTCHA_COMPONENT,
} from "./components";

export const RECAPTCHA_HELPER_GUIDE =
	"https://opengrind.org/guides/recaptcha-helper";

const MANUAL_INSTALL = {
	[GOOGLE_OAUTH_COMPONENT]: {
		releases: `${COMPONENT_REPO[GOOGLE_OAUTH_COMPONENT]}/releases#install`,
		guide: "https://opengrind.org/guides/sign-in-with-google#installed-from-google-play",
	},
	[RECAPTCHA_COMPONENT]: {
		releases: `${COMPONENT_REPO[RECAPTCHA_COMPONENT]}/releases`,
		guide: `${RECAPTCHA_HELPER_GUIDE}#installed-from-google-play`,
	},
	[FCM_COMPONENT]: {
		releases: `${COMPONENT_REPO[FCM_COMPONENT]}/releases`,
		guide: "https://opengrind.org/guides/notifications#android-fast-mode",
	},
} as const;

export function manualInstallHref(addon: keyof typeof MANUAL_INSTALL): string {
	const { releases, guide } = MANUAL_INSTALL[addon];
	return isPlayBuild() ? guide : releases;
}
