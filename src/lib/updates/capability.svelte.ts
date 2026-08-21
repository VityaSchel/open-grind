import { getUpdateCapability } from "./index";
import type { Capability } from "./types";

const undetermined = {
	state: "unsupported",
	detail: { reason: "undetermined" },
} satisfies Capability;

let capability = $state<Capability | null>(null);
let hydrating: Promise<Capability> | null = null;

export async function hydrateUpdateCapability(): Promise<void> {
	if (capability !== null) return;
	hydrating ??= getUpdateCapability()
		.catch(() => undetermined)
		.finally(() => {
			hydrating = null;
		});
	capability = await hydrating;
}

export function updatesSelfManaged(): boolean {
	return capability?.state === "supported";
}
