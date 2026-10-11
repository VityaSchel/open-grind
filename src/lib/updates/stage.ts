import { type PlainMessageKey, t } from "$lib/i18n";
import { ADDON_MESSAGES } from "./addon-messages";
import { APP_COMPONENT, type ComponentKey } from "./components";
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

const appTitleKeys = {
	available: "updates.stage.available",
	downloading: "updates.stage.downloading",
	verifying: "updates.stage.verifying",
	paused: "updates.stage.paused",
	ready: "updates.stage.ready",
	installing: "updates.stage.installing",
} as const satisfies Record<UpdateStage, PlainMessageKey>;

type StageCopyArgs = {
	component: ComponentKey;
	kind: Release["kind"];
	stage: UpdateStage;
};

export function stageTitle({ component, kind, stage }: StageCopyArgs): string {
	if (component === APP_COMPONENT) return t(appTitleKeys[stage]);
	return t(ADDON_MESSAGES[component].stage[kind][stage]);
}

const installHintKeys = {
	available: "updates.stage.hints.installOrDismiss",
	downloading: undefined,
	verifying: undefined,
	paused: "updates.stage.hints.download",
	ready: "updates.stage.hints.install",
	installing: undefined,
} as const satisfies Record<UpdateStage, PlainMessageKey | undefined>;

const addonUpdateHintKeys = {
	...installHintKeys,
	available: "updates.stage.hints.updateOrDismiss",
	ready: "updates.stage.hints.update",
} as const satisfies Record<UpdateStage, PlainMessageKey | undefined>;

export function stageBody({
	component,
	kind,
	stage,
}: StageCopyArgs): string | undefined {
	const updatesAddon = component !== APP_COMPONENT && kind === "update";
	const key = (updatesAddon ? addonUpdateHintKeys : installHintKeys)[stage];
	return key === undefined ? undefined : t(key);
}
