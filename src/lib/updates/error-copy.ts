import z from "zod";

import { type PlainMessageKey, t } from "$lib/i18n";
import { ADDON_MESSAGES, type AddonErrorName } from "./addon-messages";
import {
	ADDON_NAME,
	APP_COMPONENT,
	COMPONENT_KEYS,
	type ComponentKey,
} from "./components";
import {
	asUpdateError,
	type Release,
	type Unsupported,
	type UpdateError,
} from "./types";

type Reason = Unsupported["reason"];
type KnownKind = Exclude<UpdateError["kind"], "unsupported">;

const unsupportedKeys = {
	externallyManaged: "updates.errors.unsupported.externallyManaged",
	foreignSigner: "updates.errors.unsupported.foreignSigner",
	foreignTarget: "updates.errors.unsupported.foreignTarget",
	undetermined: "updates.errors.unsupported.undetermined",
	noReleaseArtifacts: "updates.errors.unsupported.noReleaseArtifacts",
	sandboxed: "updates.errors.unsupported.sandboxed",
	locationNotWritable: "updates.errors.unsupported.locationNotWritable",
} as const satisfies Record<Reason, PlainMessageKey>;

const addonUnsupportedErrors = {
	externallyManaged: "externallyManaged",
	foreignSigner: "foreignSigner",
	foreignTarget: "foreignTarget",
	undetermined: "undetermined",
	noReleaseArtifacts: "noReleaseArtifacts",
	sandboxed: null,
	locationNotWritable: null,
} as const satisfies Record<Reason, AddonErrorName | null>;

const userCanFix: Record<Reason, boolean> = {
	externallyManaged: false,
	foreignSigner: false,
	foreignTarget: true,
	undetermined: true,
	noReleaseArtifacts: false,
	sandboxed: false,
	locationNotWritable: true,
};

export function unsupportedIsFixable(detail: Unsupported): boolean {
	return userCanFix[detail.reason];
}

const kindKeys = {
	network: "updates.errors.network",
	server: "updates.errors.serverRefused",
	malformedIndex: "updates.errors.malformedIndex",
	noArtifact: "updates.errors.noArtifact",
	unsigned: "updates.errors.verifyFailed",
	foreignUrl: "updates.errors.foreignUrl",
	signature: "updates.errors.verifyFailed",
	storage: "updates.errors.writeFailed",
	oversize: "updates.errors.oversize",
	assetReplaced: "updates.errors.assetReplaced",
	canceled: "updates.errors.canceled",
	nothingStaged: "updates.errors.nothingStaged",
	needsUnknownSources: "updates.errors.needsUnknownSources",
	needsManualInstall: "updates.errors.needsManualInstall",
	install: "updates.errors.installFailed",
	checkTooSoon: "updates.errors.checkTooSoon",
	autoChecksDisabled: "updates.errors.autoChecksDisabled",
	unknownComponent: "updates.errors.unknownComponent",
	busy: "updates.errors.busy",
} as const satisfies Record<KnownKind, PlainMessageKey>;

const busyDetailSchema = z.object({ component: z.enum(COMPONENT_KEYS) });

const PACKAGE_MANAGER_INSTALL_FAILED_INSUFFICIENT_STORAGE = -4;

function addonKindError({
	kind,
	installKind,
}: {
	kind: KnownKind;
	installKind: Release["kind"];
}): AddonErrorName | null {
	switch (kind) {
		case "unsigned":
		case "signature":
			return "verifyFailed";
		case "storage":
			return "saveDownloadFailed";
		case "install":
			return installKind === "update" ? "updateFailed" : "installFailed";
		default:
			return null;
	}
}

function unsupportedKey({
	reason,
	component,
}: {
	reason: Reason;
	component: ComponentKey;
}): PlainMessageKey {
	if (component !== APP_COMPONENT) {
		const addonError = addonUnsupportedErrors[reason];
		if (addonError !== null) {
			return ADDON_MESSAGES[component].errors[addonError];
		}
	}
	return unsupportedKeys[reason];
}

function knownKey({
	kind,
	component,
	installKind,
}: {
	kind: KnownKind;
	component: ComponentKey;
	installKind: Release["kind"];
}): PlainMessageKey {
	if (component !== APP_COMPONENT) {
		const addonError = addonKindError({ kind, installKind });
		if (addonError !== null) {
			return ADDON_MESSAGES[component].errors[addonError];
		}
	}
	return kindKeys[kind];
}

function busyKey(running: ComponentKey): PlainMessageKey {
	return running === APP_COMPONENT
		? "updates.errors.busyApp"
		: ADDON_MESSAGES[running].errors.busy;
}

function noStorageKey({
	component,
	installKind,
}: {
	component: ComponentKey;
	installKind: Release["kind"];
}): PlainMessageKey {
	if (component === APP_COMPONENT) return "updates.errors.noStorage";
	const { errors } = ADDON_MESSAGES[component];
	return installKind === "update"
		? errors.noStorageToUpdate
		: errors.noStorageToInstall;
}

export function unsupportedText(
	{ reason }: Unsupported | Pick<Unsupported, "reason">,
	{ component = APP_COMPONENT }: { component?: ComponentKey } = {},
): string {
	return t(unsupportedKey({ reason, component }));
}

export function noReleaseText({
	component,
}: {
	component: ComponentKey;
}): string {
	return t(
		component === APP_COMPONENT
			? "updates.errors.noRelease"
			: ADDON_MESSAGES[component].errors.noRelease,
	);
}

export function updateErrorText(
	error: unknown,
	{
		fallback,
		component = APP_COMPONENT,
		kind = "install",
	}: { fallback: string; component?: ComponentKey; kind?: Release["kind"] },
): string {
	const known = asUpdateError(error);
	if (!known) return fallback;
	if (known.kind === "unsupported") {
		return unsupportedText(known.detail, { component });
	}
	if (known.kind === "busy") {
		const running = busyDetailSchema.safeParse(known.detail);
		return t(
			running.success ? busyKey(running.data.component) : kindKeys.busy,
		);
	}
	return t(knownKey({ kind: known.kind, component, installKind: kind }));
}

export function installFailedText({
	code,
	component,
	kind,
}: {
	code?: number | null;
	component: ComponentKey;
	kind: Release["kind"];
}): string {
	const key =
		code === PACKAGE_MANAGER_INSTALL_FAILED_INSUFFICIENT_STORAGE
			? noStorageKey({ component, installKind: kind })
			: knownKey({ kind: "install", component, installKind: kind });
	return t(key);
}

export function problemBody({
	component,
	title,
}: {
	component: ComponentKey;
	title: string;
}): string | undefined {
	if (component === APP_COMPONENT) return undefined;
	const namesAddon = Object.values(ADDON_MESSAGES[component].errors).some(
		(key) => t(key) === title,
	);
	return namesAddon ? undefined : t(ADDON_NAME[component]);
}
