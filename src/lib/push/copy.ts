import { ADDON_NAME, FCM_COMPONENT } from "$lib/updates/components";
import type { PushErrorReason } from "./types";

const ADDON = ADDON_NAME[FCM_COMPONENT];

const failures: Record<PushErrorReason, string> = {
	unsupportedPlatform: `Fast notifications need the Android ${ADDON}`,
	addonUnavailable: `Open Grind couldn't reach the ${ADDON}`,
	addonDisabled: `The ${ADDON} is disabled. Enable it in Android's app settings, then try again.`,
	addonUntrusted: `The installed ${ADDON} isn't signed by Open Grind. Uninstall it to install the official one.`,
	addonRefused: `The ${ADDON} refused this copy of Open Grind`,
	untrustedCaller: `The ${ADDON} does not recognize this copy of Open Grind as official`,
	timedOut: `The ${ADDON} didn't answer in time. Try again.`,
	firebaseUnavailable:
		"This device has no Google Play services or microG, so it can't receive fast notifications",
	tokenFailed: "Couldn't register this device for push notifications",
	deleteFailed: "Couldn't unregister this device from push notifications",
	malformedToken: "Push registration returned something unusable",
	failed: "Couldn't turn on fast notifications",
};

export function enableFailureText(reason: PushErrorReason | null): string {
	return failures[reason ?? "failed"];
}
