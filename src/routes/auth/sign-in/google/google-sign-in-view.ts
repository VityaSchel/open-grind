import type { UpdateStage } from "$lib/updates/stage";

export type GoogleSignInView = "install" | "continue" | "paste";

export function googleSignInView({
	automated,
	pasting,
	installed,
}: {
	automated: boolean;
	pasting: boolean;
	installed: boolean;
}): GoogleSignInView {
	if (!automated || pasting) return "paste";
	return installed ? "continue" : "install";
}

export function stageAwaitsUser(stage: UpdateStage | null): boolean {
	return stage === "available" || stage === "paused" || stage === "ready";
}

export function installButton({
	stage,
	starting,
}: {
	stage: UpdateStage | null;
	starting: boolean;
}): { label: string; busy: boolean } {
	switch (stage) {
		case "downloading":
			return { label: "Downloading…", busy: true };
		case "verifying":
			return { label: "Verifying…", busy: true };
		case "installing":
			return { label: "Installing…", busy: true };
		default:
			return { label: "Install", busy: starting };
	}
}
