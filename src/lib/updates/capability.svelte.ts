import { unsupportedIsFixable, unsupportedText } from "./error-copy";
import { getUpdateCapability, updatesAvailableHere } from "./index";
import type { Capability } from "./types";

const undetermined = {
	state: "unsupported",
	detail: { reason: "undetermined" },
} satisfies Capability;

const FDROID_CLIENTS = new Set([
	"org.fdroid.fdroid",
	"org.fdroid.fdroid.privileged",
	"org.fdroid.basic",
	"com.looker.droidify",
	"com.machiav3lli.fdroid",
]);

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

export function installedFromFdroid(): boolean {
	return (
		capability?.state === "unsupported" &&
		capability.detail.reason === "externallyManaged" &&
		FDROID_CLIENTS.has(capability.detail.detail.installer)
	);
}

export function buildSignedByOpenGrind(): boolean {
	if (capability === null) return false;
	return (
		capability.state === "supported" ||
		capability.detail.reason !== "foreignSigner"
	);
}

export function updatesUnsupportedReason(): string | null {
	if (!updatesAvailableHere() || capability?.state !== "unsupported") {
		return null;
	}
	if (!unsupportedIsFixable(capability.detail)) return null;
	return unsupportedText(capability.detail);
}
