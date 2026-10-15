import { sourceText } from "$lib/i18n";
import { ADDON_NAME, FCM_COMPONENT } from "$lib/updates/components";
import { pushErrorReason } from "./index";
import type { PushErrorReason } from "./types";

const reasons = (addon: string): Record<PushErrorReason, string | null> => ({
	unsupportedPlatform: "This build of Open Grind can't show notifications.",
	addonUnavailable: `Open Grind couldn't reach the ${addon}.`,
	addonDisabled: `The ${addon} is disabled. Enable it in Android settings.`,
	addonUntrusted: sourceText("updates.addons.fcm.errors.foreignTarget"),
	addonRefused: `The ${addon} refused this copy of Open Grind.`,
	addonOutdated: `The ${addon} is out of date. Update it to the latest version.`,
	addonHidden: `The ${addon} is hidden or frozen, for example by Ice Box or Hail. Unfreeze it.`,
	addonTurnedOff: `An app like Blocker or App Manager turned off part of the ${addon}. Turn it back on in that app.`,
	addonBlocked: `Android or another app stopped Open Grind from starting the ${addon}. Allow it to auto-start in your phone's settings, then try again.`,
	untrustedCaller: `The ${addon} doesn't recognize this copy of Open Grind as official.`,
	timedOut: `The ${addon} didn't answer in time.`,
	firebaseUnavailable: "This device has no Google Play services or microG.",
	tokenFailed: "Firebase couldn't register this device.",
	deleteFailed: "Firebase couldn't unregister this device.",
	malformedToken: "Firebase returned an unusable registration.",
	failed: null,
});

export function explainedPushError(error: unknown): unknown {
	const addon = sourceText(ADDON_NAME[FCM_COMPONENT]);
	const reason = reasons(addon)[pushErrorReason(error) ?? "failed"];
	return reason === null ? error : new Error(reason, { cause: error });
}
