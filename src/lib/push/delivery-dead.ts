import { fcmServiceInstalled, pushErrorReason } from "./index";
import type { PushErrorReason } from "./types";

const DELIVERY_DEAD: ReadonlySet<PushErrorReason> = new Set<PushErrorReason>([
	"addonDisabled",
	"addonRefused",
	"addonUntrusted",
	"addonOutdated",
	"addonHidden",
	"untrustedCaller",
	"firebaseUnavailable",
]);

const ADDON_GONE: ReadonlySet<PushErrorReason> = new Set<PushErrorReason>([
	"addonUnavailable",
	"addonDisabled",
	"addonUntrusted",
	"addonOutdated",
	"addonHidden",
	"addonTurnedOff",
	"addonBlocked",
]);

export async function fastDeliveryDead(error: unknown): Promise<boolean> {
	const reason = pushErrorReason(error);
	if (reason === "addonUnavailable") return !(await fcmServiceInstalled());
	return reason !== null && DELIVERY_DEAD.has(reason);
}

export function addonGone(error: unknown): boolean {
	const reason = pushErrorReason(error);
	return reason !== null && ADDON_GONE.has(reason);
}
