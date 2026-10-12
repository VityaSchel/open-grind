import type { PlainMessageKey } from "$lib/i18n";

type PushFailure = "enable" | "disable" | "enableFastMode" | "switchToSlowMode";

export const pushFailures = {
	enable: "updates.push.errors.enableFailed",
	disable: "updates.push.errors.disableFailed",
	enableFastMode: "updates.push.errors.enableFastModeFailed",
	switchToSlowMode: "updates.push.errors.switchToSlowModeFailed",
} as const satisfies Record<PushFailure, PlainMessageKey>;
