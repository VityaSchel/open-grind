import z from "zod";

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

const unsupportedCopy: Record<Unsupported["reason"], string> = {
	externallyManaged:
		"Updates are managed by the store that installed the app",
	foreignSigner: "This build was not signed by Open Grind",
	foreignTarget: "The installed app isn't signed by Open Grind",
	undetermined: "Open Grind can't tell whether it may update itself",
	noReleaseArtifacts: "No release is published for this platform",
	sandboxed: "The sandbox this app runs in manages its own updates",
	locationNotWritable: "Open Grind can't install the update in its directory",
};

const userCanFix: Record<Unsupported["reason"], boolean> = {
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

type KnownKind = Exclude<UpdateError["kind"], "unsupported">;
type AddonText = (addon: string) => string;

const copy: Record<KnownKind, string> = {
	network: "Couldn't reach the release server",
	server: "The release server refused the request",
	malformedIndex: "The release server sent something unreadable",
	noArtifact: "The release has no download for this platform",
	unsigned: "Failed to verify the update",
	foreignUrl: "The release points somewhere outside the release server",
	signature: "Failed to verify the update",
	storage: "Couldn't write the update to storage",
	oversize: "The download was larger than the release said",
	assetReplaced: "The release changed during the download. Try again.",
	canceled: "Update canceled",
	nothingStaged: "No update is ready to install",
	needsUnknownSources: "Open Grind needs permission to install updates",
	needsManualInstall: "Quit Open Grind, then drag it onto Applications",
	install: "Couldn't install the update",
	checkTooSoon: "Already checked for updates recently",
	autoChecksDisabled: "Automatic update checks are turned off",
	unknownComponent: "Open Grind doesn't know that component",
	busy: "Another download is already running",
};

const addonUnsupportedCopy: Partial<Record<Unsupported["reason"], AddonText>> =
	{
		externallyManaged: (addon) =>
			`The store that installed the ${addon} manages its updates`,
		foreignSigner: (addon) =>
			`This copy of Open Grind isn't signed by Open Grind, so it can't install the ${addon}`,
		foreignTarget: (addon) =>
			`The installed ${addon} isn't signed by Open Grind. Uninstall it to install the official one.`,
		noReleaseArtifacts: (addon) =>
			`The ${addon} isn't published for this device`,
		undetermined: (addon) =>
			`Open Grind can't tell whether it may install the ${addon}`,
	};

const addonCopy: Partial<Record<KnownKind, AddonText>> = {
	unsigned: (addon) => `Failed to verify the ${addon}`,
	signature: (addon) => `Failed to verify the ${addon}`,
	storage: (addon) => `Couldn't save the ${addon} download`,
	install: (addon) => `Couldn't install the ${addon}`,
};

const addonUpdateCopy: Partial<Record<KnownKind, AddonText>> = {
	install: (addon) => `Couldn't update the ${addon}`,
};

const addonNoStorageCopy: Record<Release["kind"], AddonText> = {
	install: (addon) => `Not enough storage to install the ${addon}`,
	update: (addon) => `Not enough storage to update the ${addon}`,
};

const busyDetailSchema = z.object({ component: z.enum(COMPONENT_KEYS) });

const PACKAGE_MANAGER_INSTALL_FAILED_INSUFFICIENT_STORAGE = -4;

function busyText(component: ComponentKey): string {
	return component === APP_COMPONENT
		? "Wait for the Open Grind update to finish downloading"
		: `Wait for the ${ADDON_NAME[component]} to finish downloading`;
}

export function unsupportedText(
	{ reason }: Unsupported | Pick<Unsupported, "reason">,
	{ component = APP_COMPONENT }: { component?: ComponentKey } = {},
): string {
	const addonText =
		component === APP_COMPONENT
			? undefined
			: addonUnsupportedCopy[reason]?.(ADDON_NAME[component]);
	return addonText ?? unsupportedCopy[reason];
}

export function noReleaseText({
	component,
}: {
	component: ComponentKey;
}): string {
	const subject =
		component === APP_COMPONENT ? "Open Grind" : ADDON_NAME[component];
	return `No ${subject} release is published yet`;
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
		return running.success ? busyText(running.data.component) : copy.busy;
	}
	if (component === APP_COMPONENT) return copy[known.kind];
	const addon = ADDON_NAME[component];
	const updateText =
		kind === "update" ? addonUpdateCopy[known.kind]?.(addon) : undefined;
	return updateText ?? addonCopy[known.kind]?.(addon) ?? copy[known.kind];
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
	if (code === PACKAGE_MANAGER_INSTALL_FAILED_INSUFFICIENT_STORAGE) {
		return component === APP_COMPONENT
			? "Not enough storage to install the update"
			: addonNoStorageCopy[kind](ADDON_NAME[component]);
	}
	return updateErrorText(
		{ kind: "install" },
		{ fallback: copy.install, component, kind },
	);
}

export function problemBody({
	component,
	title,
}: {
	component: ComponentKey;
	title: string;
}): string | undefined {
	if (component === APP_COMPONENT) return undefined;
	const addon = ADDON_NAME[component];
	return title.toLowerCase().includes(addon.toLowerCase())
		? undefined
		: addon;
}
