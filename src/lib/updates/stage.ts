import { ADDON_NAME, APP_COMPONENT, type ComponentKey } from "./components";
import type { Progress, Release, UpdateError } from "./types";

export type UpdateStage =
	| "available"
	| "downloading"
	| "verifying"
	| "paused"
	| "ready"
	| "installing";

export type StageView = { stage: UpdateStage; received: number; total: number };

export type StageChange =
	| { view: StageView }
	| { failed: UpdateError | undefined };

export function stageOf(progress: Progress): StageChange {
	const { received, total } = progress;
	switch (progress.phase) {
		case "downloading":
			return { view: { stage: "downloading", received, total } };
		case "verifying":
			return { view: { stage: "verifying", received: 0, total: 0 } };
		case "ready":
			return { view: { stage: "ready", received: total, total } };
		case "canceled":
			return { view: { stage: "paused", received, total } };
		case "failed":
			return { failed: progress.detail };
	}
}

const appTitles: Record<UpdateStage, string> = {
	available: "New update available",
	downloading: "Downloading update…",
	verifying: "Verifying the update…",
	paused: "Update is available",
	ready: "Update is downloaded",
	installing: "Installing…",
};

type AddonTitle = (addon: string) => string;

const addonTitles: Record<Release["kind"], Record<UpdateStage, AddonTitle>> = {
	install: {
		available: (addon) => `${addon} is available`,
		downloading: (addon) => `Downloading the ${addon}…`,
		verifying: (addon) => `Verifying the ${addon}…`,
		paused: (addon) => `${addon} is ready to download`,
		ready: (addon) => `${addon} is downloaded`,
		installing: (addon) => `Installing the ${addon}…`,
	},
	update: {
		available: (addon) => `${addon} update available`,
		downloading: (addon) => `Downloading the ${addon} update…`,
		verifying: (addon) => `Verifying the ${addon} update…`,
		paused: (addon) => `${addon} update is available`,
		ready: (addon) => `${addon} update is downloaded`,
		installing: (addon) => `Updating the ${addon}…`,
	},
};

type StageCopyArgs = {
	component: ComponentKey;
	kind: Release["kind"];
	stage: UpdateStage;
};

export function stageTitle({ component, kind, stage }: StageCopyArgs): string {
	if (component === APP_COMPONENT) return appTitles[stage];
	return addonTitles[kind][stage](ADDON_NAME[component]);
}

const installBodies: Record<UpdateStage, string | undefined> = {
	available: "Tap to install, swipe to dismiss",
	downloading: undefined,
	verifying: undefined,
	paused: "Tap to download",
	ready: "Tap to install",
	installing: undefined,
};

const addonUpdateBodies: Record<UpdateStage, string | undefined> = {
	...installBodies,
	available: "Tap to update, swipe to dismiss",
	ready: "Tap to update",
};

export function stageBody({
	component,
	kind,
	stage,
}: StageCopyArgs): string | undefined {
	const updatesAddon = component !== APP_COMPONENT && kind === "update";
	return (updatesAddon ? addonUpdateBodies : installBodies)[stage];
}
