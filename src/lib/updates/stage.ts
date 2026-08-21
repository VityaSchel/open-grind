import type { Progress, UpdateError } from "./types";

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
