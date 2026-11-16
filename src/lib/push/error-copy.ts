import type { PlainMessageKey } from "#lib/i18n/index.ts";

type PushFailure =
	| "enable"
	| "disable"
	| "enableFastMode"
	| "switchToSlowMode"
	| "relayNoDistributor"
	| "relayActionRequired"
	| "relaySetup"
	| "relaySave"
	| "relayShare"
	| "relayCodeCheck"
	| "relayStopped"
	| "relayStoppedAction";

export const pushFailures = {
	enable: "updates.push.errors.enableFailed",
	disable: "updates.push.errors.disableFailed",
	enableFastMode: "updates.push.errors.enableFastModeFailed",
	switchToSlowMode: "updates.push.errors.switchToSlowModeFailed",
	relayNoDistributor: "updates.push.errors.relayNoDistributor",
	relayActionRequired: "updates.push.errors.relayActionRequired",
	relaySetup: "updates.push.errors.relaySetupFailed",
	relaySave: "updates.push.errors.relaySaveFailed",
	relayShare: "updates.push.errors.relayShareFailed",
	relayCodeCheck: "updates.push.errors.relayCodeCheckFailed",
	relayStopped: "updates.push.errors.relayStopped",
	relayStoppedAction: "updates.push.errors.relayStoppedAction",
} as const satisfies Record<PushFailure, PlainMessageKey>;
