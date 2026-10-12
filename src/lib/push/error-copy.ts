import type { PlainMessageKey } from "$lib/i18n";

type PushFailure = "enable" | "turnOff" | "enableFastMode" | "switchToSlowMode";

export const pushFailures = {
	enable: "updates.push.errors.enableFailed",
	turnOff: "updates.push.errors.turnOffFailed",
	enableFastMode: "updates.push.errors.enableFastModeFailed",
	switchToSlowMode: "updates.push.errors.switchToSlowModeFailed",
} as const satisfies Record<PushFailure, PlainMessageKey>;
