import { ADDON_NAME, FCM_COMPONENT } from "$lib/updates/components";
import { pushErrorReason } from "./index";
import type { PushErrorReason } from "./types";

const ADDON = ADDON_NAME[FCM_COMPONENT];

const reasons: Record<PushErrorReason, string | null> = {
	unsupportedPlatform: "Fast mode only works on Android.",
	addonUnavailable: `Open Grind couldn't reach the ${ADDON}.`,
	addonDisabled: `The ${ADDON} is disabled. Enable it in Android settings.`,
	addonUntrusted: `The installed ${ADDON} isn't signed by Open Grind. Uninstall it, then install the official one.`,
	addonRefused: `The ${ADDON} refused this copy of Open Grind.`,
	untrustedCaller: `The ${ADDON} doesn't recognize this copy of Open Grind as official.`,
	timedOut: `The ${ADDON} didn't answer in time.`,
	firebaseUnavailable: "This device has no Google Play services or microG.",
	tokenFailed: "Firebase couldn't register this device.",
	deleteFailed: "Firebase couldn't unregister this device.",
	malformedToken: "Firebase returned an unusable registration.",
	failed: null,
};

export const pushFailures = {
	turnOn: "Couldn't turn on notifications",
	turnOff: "Couldn't turn off notifications",
	fastMode: "Couldn't enable the fast mode for push notifications",
	slowMode: "Couldn't switch push notifications to the slow mode",
	saveCategory: "Couldn't save notification settings",
};

export function explainedPushError(error: unknown): unknown {
	const reason = reasons[pushErrorReason(error) ?? "failed"];
	return reason === null ? error : new Error(reason, { cause: error });
}
