import { updateErrorText } from "./error-copy";
import {
	asUpdateError,
	cancelUpdateDownload,
	checkForUpdate,
	discardStagedUpdate,
	getUpdateProgress,
	getUpdateReadiness,
	installUpdate,
	onInstallFinished,
	onUpdateProgress,
	openInstallPermissionSettings,
	startUpdateDownload,
	takeInstallOutcome,
} from "./index";
import { stageOf, type StageView } from "./stage";
import {
	dismissStage,
	showInstalled,
	showManualInstall,
	showProblem,
	showStage,
} from "./toasts";

const fromScratch = { received: 0, total: 0 };

let shown: StageView = { stage: "available", received: 0, total: 0 };
let installedFrom: StageView | null = null;
let canInstallNow = false;
let installing = false;
let settling: Promise<boolean> | null = null;
let dismissed = false;
let autoRefetched = false;
let following = false;
let started = false;

export async function startUpdateWatch(): Promise<void> {
	if (started) return;
	started = true;
	follow();
	await announceLastInstall();

	const running = await getUpdateProgress().catch(() => null);
	const resumed = running && stageOf(running);
	if (
		resumed &&
		"view" in resumed &&
		resumed.view.stage === "downloading" &&
		(await download(resumed.view))
	) {
		return;
	}
	if (await settle()) return;
	await offerCheck("launch");
}

export async function checkForUpdateNow(): Promise<void> {
	follow();
	await offerCheck("manual");
}

async function activate(): Promise<void> {
	if (shown.stage === "available" || shown.stage === "paused") {
		await download(shown);
		return;
	}
	await install();
}

async function download({
	received,
	total,
}: {
	received: number;
	total: number;
}): Promise<boolean> {
	show({ stage: "downloading", received, total });
	try {
		await startUpdateDownload();
		return true;
	} catch (error) {
		if (asUpdateError(error)?.kind !== "nothingStaged") {
			reportFailure(error);
			return true;
		}
		await discardStagedUpdate().catch(() => undefined);
		dismissStage();
		return false;
	}
}

async function install(): Promise<void> {
	if (installing) return;
	installing = true;
	const ready: StageView = { ...shown, stage: "ready" };
	try {
		if (!canInstallNow) {
			await requestInstallPermission();
			return;
		}
		show({ ...ready, stage: "installing" });
		installedFrom = ready;
		await installUpdate();
	} catch (error) {
		installedFrom = null;
		show(ready);
		switch (asUpdateError(error)?.kind) {
			case "needsUnknownSources":
				canInstallNow = false;
				await requestInstallPermission();
				return;
			case "needsManualInstall":
				dismissStage();
				showManualInstall(
					updateErrorText(error, "Drag it onto Applications"),
				);
				return;
			case "nothingStaged":
				await downloadAgain();
				return;
			default:
				showProblem({
					title: updateErrorText(
						error,
						"Couldn't install the update",
					),
				});
		}
	} finally {
		installing = false;
	}
}

async function requestInstallPermission(): Promise<void> {
	try {
		await openInstallPermissionSettings();
	} catch (error) {
		showProblem({
			title: updateErrorText(
				error,
				"Couldn't open the install permission screen",
			),
		});
		return;
	}
	const resume = (): void => {
		if (document.visibilityState !== "visible") return;
		document.removeEventListener("visibilitychange", resume);
		void settle().then(() => {
			if (canInstallNow) void install();
		});
	};
	document.addEventListener("visibilitychange", resume);
}

async function downloadAgain(): Promise<void> {
	if (await settle()) return;
	await offerCheck("manual");
	if (shown.stage === "available") {
		await download(fromScratch);
		return;
	}
	dismissStage();
}

async function settle(): Promise<boolean> {
	settling ??= (async () => {
		const readiness = await getUpdateReadiness().catch(() => null);
		canInstallNow =
			readiness?.state === "ready" && readiness.detail.canInstallNow;

		switch (readiness?.state) {
			case "resumable":
				return await download(fromScratch);
			case "ready":
				show({ stage: "ready", received: 1, total: 1 });
				return true;
			default:
				return false;
		}
	})().finally(() => {
		settling = null;
	});
	return settling;
}

async function offerCheck(trigger: "launch" | "manual"): Promise<void> {
	const result = await checkForUpdate(trigger).catch((error: unknown) => {
		if (asUpdateError(error)?.kind === "unsigned") reportFailure(error);
		return null;
	});
	if (!result?.available) return;
	dismissed = false;
	show({ stage: "available", ...fromScratch });
}

function follow(): void {
	if (following) return;
	following = true;
	void onInstallFinished((outcome) => {
		void takeInstallOutcome().catch(() => null);
		const ready = installedFrom;
		if (!ready) return;
		installedFrom = null;
		if (outcome.succeeded) return;
		if (!outcome.canceled) {
			showProblem({
				title: outcome.message ?? "The update did not install",
			});
		}
		show(ready);
		void settle();
	});
	void onUpdateProgress((progress) => {
		const change = stageOf(progress);
		if ("failed" in change) {
			reportFailure(change.failed);
			return;
		}
		if (change.view.stage !== "ready") {
			show(change.view);
			return;
		}
		autoRefetched = false;
		if (!installing) void settle();
	});
}

async function announceLastInstall(): Promise<void> {
	const outcome = await takeInstallOutcome().catch(() => null);
	if (!outcome) return;
	if (outcome.succeeded) {
		await showInstalled();
		return;
	}
	if (outcome.canceled) return;
	showProblem({ title: outcome.message ?? "The update did not install" });
}

function show(next: StageView): void {
	const offerable = next.stage === "available" || next.stage === "paused";
	if (dismissed && offerable) return;
	shown = next;
	showStage({
		view: next,
		onActivate: () => void activate(),
		onCancel: () =>
			void cancelUpdateDownload().catch((error: unknown) => {
				showProblem({
					title: updateErrorText(error, "Couldn't stop the download"),
				});
			}),
		onDismiss: () => {
			if (offerable) dismissed = true;
		},
	});
}

function reportFailure(error: unknown): void {
	const known = asUpdateError(error);
	if (known?.kind === "assetReplaced" && !autoRefetched) {
		autoRefetched = true;
		void downloadAgain();
		return;
	}

	dismissStage();
	showProblem({ title: updateErrorText(error, "The update failed") });

	if (known?.kind !== "server") return;

	const { status } = known.detail;
	const refusedForGood = status >= 400 && status < 500 && status !== 429;
	if (refusedForGood) void discardStagedUpdate().catch(() => undefined);
}
