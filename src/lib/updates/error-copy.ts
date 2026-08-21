import { asUpdateError, type Unsupported, type UpdateError } from "./types";

const unsupportedCopy: Record<Unsupported["reason"], string> = {
	externallyManaged:
		"Updates are managed by the store that installed the app",
	foreignSigner: "This build was not signed by Open Grind",
	undetermined: "Open Grind can't tell whether it may update itself",
	noReleaseArtifacts: "No release is published for this platform",
	sandboxed: "The sandbox this app runs in manages its own updates",
};

const copy: Record<Exclude<UpdateError["kind"], "unsupported">, string> = {
	network: "Couldn't reach the release server",
	server: "The release server refused the request",
	malformedIndex: "The release server sent something unreadable",
	noArtifact: "The release has no download for this platform",
	unsigned: "Failed to verify the update",
	foreignUrl: "The release points somewhere outside the release server",
	signature: "Failed to verify the update",
	storage: "Couldn't write the update to storage",
	oversize: "The download was larger than the release said",
	assetReplaced: "The release changed, downloading it again",
	canceled: "Update canceled",
	nothingStaged: "No update is ready to install",
	needsUnknownSources: "Open Grind needs permission to install updates",
	needsManualInstall: "Quit Open Grind, then drag it onto Applications",
	install: "Couldn't install the update",
	checkTooSoon: "Already checked for updates recently",
	autoChecksDisabled: "Automatic update checks are turned off",
};

export function updateErrorText(error: unknown, fallback: string): string {
	const known = asUpdateError(error);
	if (!known) return fallback;
	return known.kind === "unsupported"
		? unsupportedCopy[known.detail.reason]
		: copy[known.kind];
}
