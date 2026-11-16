import { sourceText } from "#lib/i18n/index.ts";
import { ADDON_NAME, FCM_COMPONENT } from "#lib/updates/components.ts";
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
	fastUnconfigured: "Fast Mode has no delivery method set up yet.",
	relayNoDistributor: "No UnifiedPush distributor app is installed.",
	relayDistributorUnavailable:
		"No UnifiedPush distributor app was chosen, or the chosen one is gone.",
	relayActionRequired:
		"The UnifiedPush distributor app needs you to finish its own setup first.",
	relayVapidRequired:
		"The UnifiedPush distributor app refused the registration because it requires VAPID.",
	relayNetwork:
		"The UnifiedPush distributor app couldn't reach its server. Check your connection.",
	relayRegistrationFailed:
		"The UnifiedPush distributor app couldn't register Open Grind.",
	relayTimedOut: "The UnifiedPush distributor app didn't answer in time.",
	relayCancelled: "The fcm-relay setup was canceled.",
	relaySetupLost:
		"The UnifiedPush distributor app dropped the fcm-relay setup before it finished.",
	relayNoSetup: "No fcm-relay setup is in progress.",
	relayUnpaired: "No fcm-relay is paired with this account.",
	relayRegisterFailed:
		"Grindr didn't accept the fcm-relay registration. Try again later.",
	relayAccountChanged:
		"The fcm-relay pairing belongs to another Grindr account.",
	relaySaveFailed: "Android couldn't write the config file.",
	relayShareFailed: "Android couldn't share the config file.",
	failed: null,
});

export function explainedPushError(error: unknown): unknown {
	const addon = sourceText(ADDON_NAME[FCM_COMPONENT]);
	const reason = reasons(addon)[pushErrorReason(error) ?? "failed"];
	return reason === null ? error : new Error(reason, { cause: error });
}
