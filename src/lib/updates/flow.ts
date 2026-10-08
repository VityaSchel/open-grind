import { Generation } from "$lib/util/generation";
import {
	APP_COMPONENT,
	COMPONENT_PACKAGE,
	type ComponentKey,
} from "./components";
import {
	installFailedText,
	noReleaseText,
	unsupportedText,
	updateErrorText,
} from "./error-copy";
import {
	asUpdateError,
	cancelUpdateDownload,
	checkForUpdate,
	discardStagedUpdate,
	getInstalledVersion,
	getUpdateProgress,
	getUpdateReadiness,
	installPending,
	installUpdate,
	onInstallFinished,
	onUpdateProgress,
	startUpdateDownload,
	takeInstallOutcome,
} from "./index";
import { openPermissionScreen, ReturnAction } from "./on-return";
import { stageOf, type StageView } from "./stage";
import type { CheckResult, InstallOutcome, Release } from "./types";

export type Trigger = "launch" | "manual" | "automatic";
export type InstallKind = Release["kind"];
export type CheckReport = "offered" | "current" | "busy" | "failed";
export type CheckOptions = { reportFailure?: boolean };
type FailureReport = "all" | "unsigned" | "none";

export type StagePresenter = {
	show(args: {
		view: StageView;
		kind: InstallKind;
		onActivate: () => void;
		onCancel: () => void;
		onDismiss: () => void;
	}): void;
	dismiss(): void;
	problem(title: string): void;
	manualInstall(body: string): void;
	installed(args: { tag: string | null; kind: InstallKind }): void;
	upToDate(): void;
};

const fromScratch = { received: 0, total: 0 };
const AUTOMATIC_CHECK_TICK_MS = 60 * 60 * 1000;

type InstallClaim = { flow: UpdateFlow; committing: boolean };

let installOwner: InstallClaim | null = null;

function isOffer({ stage }: StageView): boolean {
	return stage === "available" || stage === "paused";
}

export class UpdateFlow {
	readonly component: ComponentKey;
	readonly #presenter: StagePresenter;
	#shown: StageView = { stage: "available", ...fromScratch };
	#visible = false;
	#installedFrom: StageView | null = null;
	#readyTag: string | null = null;
	#offerTag: string | null = null;
	readonly #installOnReturn = new ReturnAction();
	#readyKind: InstallKind = "update";
	#showing = new Generation();
	#armedTag: string | null = null;
	#canInstallNow = false;
	#installing = false;
	#settling: Promise<boolean> | null = null;
	#dismissed = false;
	#autoRefetched = false;
	#following = false;
	#started = false;

	constructor({
		component,
		presenter,
	}: {
		component: ComponentKey;
		presenter: StagePresenter;
	}) {
		this.component = component;
		this.#presenter = presenter;
	}

	get #ownsInstallLedger(): boolean {
		return this.component === APP_COMPONENT;
	}

	get busy(): boolean {
		const { stage } = this.#shown;
		return (
			this.#visible &&
			(stage === "downloading" ||
				stage === "verifying" ||
				stage === "installing")
		);
	}

	async start(): Promise<void> {
		if (this.#started) return;
		this.#started = true;
		this.#follow();
		setInterval(() => {
			void this.#backgroundCheck("automatic");
		}, AUTOMATIC_CHECK_TICK_MS);
		if (this.#ownsInstallLedger) await this.#announceLastInstall();

		const running = await getUpdateProgress().catch(() => null);
		const resumed =
			running?.component === this.component && stageOf(running);
		if (
			resumed &&
			"view" in resumed &&
			resumed.view.stage === "downloading"
		) {
			this.#readyKind = running.kind;
			if (await this.#download(resumed.view)) return;
		}
		if (await this.#settle({ atLaunch: true })) return;
		await this.#offerCheck("launch");
	}

	async checkNow({
		reportFailure = false,
	}: CheckOptions = {}): Promise<CheckReport> {
		this.#follow();
		if (this.#installedFrom || this.#visible) return "busy";
		const result = await this.#check("manual", {
			report: reportFailure ? "all" : "none",
		});
		if (!result) return "failed";
		if (this.#installedFrom || this.#visible) return "busy";
		return this.#offer(result) ? "offered" : "current";
	}

	async withdrawUpdate(): Promise<void> {
		const withdrawable =
			this.#visible &&
			!this.#installedFrom &&
			this.#readyKind === "update";
		if (!withdrawable) return;
		this.#dismissed = true;
		await this.#dropStage();
	}

	async installNow(): Promise<void> {
		this.#follow();
		this.#dismissed = false;
		if (this.busy || this.#installing) return;
		const readiness = await getUpdateReadiness(this.component).catch(
			() => null,
		);
		switch (readiness?.state) {
			case "ready":
				this.#readyTag = readiness.detail.tag;
				this.#readyKind = readiness.detail.kind;
				this.#show({ stage: "ready", received: 1, total: 1 });
				await this.#install();
				return;
			case "resumable": {
				this.#readyKind = readiness.detail.kind;
				this.#armedTag = readiness.detail.tag;
				this.#offerTag = readiness.detail.tag;
				const handled = await this.#download(fromScratch, {
					byUser: true,
					arm: true,
				});
				if (handled) return;
				break;
			}
			case "unsupported":
				this.#presenter.problem(
					unsupportedText(readiness.detail, {
						component: this.component,
					}),
				);
				return;
		}
		await this.#installFromCheck();
	}

	async #installFromCheck({ retried = false } = {}): Promise<void> {
		const result = await this.#check("manual", { report: "all" });
		if (!result) return;
		if (!result.available || !result.release) {
			if (result.currentVersion === null) {
				this.#presenter.problem(
					noReleaseText({ component: this.component }),
				);
			} else {
				this.#presenter.upToDate();
			}
			return;
		}
		this.#readyKind = result.release.kind;
		this.#armedTag = result.release.tag;
		const handled = await this.#download(fromScratch, {
			byUser: true,
			arm: true,
		});
		if (handled) return;
		if (retried) this.#presenter.problem("Couldn't start the download");
		else await this.#installFromCheck({ retried: true });
	}

	async #activate(): Promise<void> {
		if (isOffer(this.#shown)) {
			await this.#download(this.#shown, { byUser: true });
			return;
		}
		await this.#install();
	}

	async #download(
		{ received, total }: { received: number; total: number },
		{
			byUser = false,
			arm = false,
		}: { byUser?: boolean; arm?: boolean } = {},
	): Promise<boolean> {
		const before = this.#visible ? this.#shown : null;
		this.#show({ stage: "downloading", received, total });
		try {
			const started = await startUpdateDownload(this.component);
			if (arm) this.#armedTag = started.tag;
			return true;
		} catch (error) {
			const kind = asUpdateError(error)?.kind;
			if (kind === "busy") {
				this.#armedTag = null;
				this.#show(before ?? { stage: "paused", received, total });
				if (byUser) this.#problem({ error, fallback: "" });
				return true;
			}
			if (kind !== "nothingStaged") {
				if (kind !== "assetReplaced") this.#armedTag = null;
				this.#reportFailure(error);
				return true;
			}
			this.#armedTag = null;
			await this.#dropStage();
			return false;
		}
	}

	async #install(): Promise<void> {
		if (this.#installing) return;
		this.#installing = true;
		const ready: StageView = { ...this.#shown, stage: "ready" };
		try {
			const claim = await this.#claimInstall();
			if (!claim) {
				this.#presenter.problem("Finish the other install first");
				return;
			}
			const readiness = await getUpdateReadiness(this.component);
			if (readiness.state === "unsupported") {
				this.#releaseInstall();
				this.#hide();
				this.#presenter.problem(
					unsupportedText(readiness.detail, {
						component: this.component,
					}),
				);
				return;
			}
			if (readiness.state !== "ready") {
				this.#releaseInstall();
				await this.#downloadAgain();
				return;
			}
			if (!readiness.detail.canInstallNow) {
				this.#releaseInstall();
				await this.#requestInstallPermission();
				return;
			}
			this.#show({ ...ready, stage: "installing" });
			this.#installedFrom = ready;
			await installUpdate(this.component);
			claim.committing = false;
		} catch (error) {
			this.#releaseInstall();
			this.#show(ready);
			switch (asUpdateError(error)?.kind) {
				case "needsUnknownSources":
					await this.#requestInstallPermission();
					return;
				case "needsManualInstall":
					this.#hide();
					this.#presenter.manualInstall(
						updateErrorText(error, {
							fallback: "Drag it onto Applications",
						}),
					);
					return;
				case "nothingStaged":
					await this.#downloadAgain();
					return;
				default:
					this.#problem({
						error,
						fallback: "Couldn't install the update",
					});
			}
		} finally {
			this.#installing = false;
		}
	}

	async #claimInstall(): Promise<InstallClaim | null> {
		const owner = installOwner;
		if (owner && owner.flow !== this) {
			if (owner.committing) return null;
			if (await installPending().catch(() => true)) return null;
			if (installOwner !== owner) return this.#claimInstall();
			owner.flow.#yieldInstall();
		}
		const claim = { flow: this, committing: true };
		installOwner = claim;
		return claim;
	}

	#yieldInstall(): void {
		this.#releaseInstall();
		void this.#settleOrHide();
	}

	async #stillInstalled(): Promise<boolean> {
		if (this.component === APP_COMPONENT) return true;
		return getInstalledVersion(this.component).then(
			(version) => version !== null,
			() => true,
		);
	}

	async #dropStage(): Promise<void> {
		await discardStagedUpdate(this.component).catch(() => undefined);
		this.#hide();
	}

	#releaseInstall(): void {
		this.#installedFrom = null;
		if (installOwner?.flow === this) installOwner = null;
	}

	async #requestInstallPermission(): Promise<void> {
		const opened = await openPermissionScreen({
			component: this.component,
			onReturn: () =>
				void this.#settleOrHide().then((usable) => {
					if (usable && this.#canInstallNow) void this.#install();
				}),
		});
		if (!opened) {
			this.#presenter.problem(
				"Couldn't open the install permission screen",
			);
		}
	}

	async #downloadAgain(): Promise<void> {
		if (await this.#settle()) return;
		const acceptInstall =
			this.#armedTag !== null || this.#readyKind === "install";
		if (!acceptInstall && !(await this.#stillInstalled())) {
			await this.#dropStage();
			return;
		}
		await this.#offerCheck("manual", { acceptInstall });
		if (this.#shown.stage === "available") {
			await this.#download(fromScratch);
			return;
		}
		this.#hide();
	}

	async #settle({ atLaunch = false }: { atLaunch?: boolean } = {}) {
		this.#settling ??= (async () => {
			const readiness = await getUpdateReadiness(this.component).catch(
				() => null,
			);
			this.#canInstallNow =
				readiness?.state === "ready" && readiness.detail.canInstallNow;
			const offersInstall =
				(readiness?.state === "ready" ||
					readiness?.state === "resumable") &&
				readiness.detail.kind !== "update";
			if (atLaunch && offersInstall) return false;

			switch (readiness?.state) {
				case "resumable":
					this.#readyKind = readiness.detail.kind;
					this.#offerTag = readiness.detail.tag;
					return await this.#download(fromScratch);
				case "ready":
					this.#readyTag = readiness.detail.tag;
					this.#readyKind = readiness.detail.kind;
					this.#show({ stage: "ready", received: 1, total: 1 });
					return true;
				default:
					return false;
			}
		})().finally(() => {
			this.#settling = null;
		});
		return this.#settling;
	}

	async #settleOrHide(): Promise<boolean> {
		const usable = await this.#settle();
		if (!usable && this.#visible) this.#hide();
		return usable;
	}

	get #offerReplaceable(): boolean {
		const updateOnScreen =
			isOffer(this.#shown) && this.#readyKind === "update";
		return !this.#installedFrom && (!this.#visible || updateOnScreen);
	}

	#keepsScreen({ available, release }: CheckResult): boolean {
		if (!this.#offerReplaceable) return true;
		const offerKept = this.#visible || this.#dismissed;
		return available && offerKept && release?.tag === this.#offerTag;
	}

	async #backgroundCheck(trigger: Trigger): Promise<void> {
		if (!this.#offerReplaceable) return;
		const result = await this.#check(trigger);
		if (!result || this.#keepsScreen(result) || this.#offer(result)) return;
		if (this.#visible) this.#hide();
	}

	async #check(
		trigger: Trigger,
		{ report = "unsigned" }: { report?: FailureReport } = {},
	): Promise<CheckResult | null> {
		return checkForUpdate({ trigger, component: this.component }).catch(
			(error: unknown) => {
				if (report === "all") {
					this.#problem({
						error,
						fallback: "Couldn't check for updates",
					});
				} else if (
					report === "unsigned" &&
					asUpdateError(error)?.kind === "unsigned"
				) {
					this.#reportFailure(error);
				}
				return null;
			},
		);
	}

	async #offerCheck(
		trigger: Trigger,
		{ acceptInstall = false }: { acceptInstall?: boolean } = {},
	): Promise<void> {
		const result = await this.#check(trigger);
		if (result) this.#offer(result, { acceptInstall });
	}

	#offer(
		{ available, release }: CheckResult,
		{ acceptInstall = false }: { acceptInstall?: boolean } = {},
	): boolean {
		if (!available || !release) return false;
		if (release.kind !== "update" && !acceptInstall) return false;
		this.#readyKind = release.kind;
		this.#dismissed = false;
		this.#offerTag = release.tag;
		this.#show({ stage: "available", ...fromScratch });
		return true;
	}

	#ownsOutcome({ packageName }: InstallOutcome): boolean {
		if (this.#ownsInstallLedger && !packageName) return true;
		return packageName === COMPONENT_PACKAGE[this.component];
	}

	#follow(): void {
		if (this.#following) return;
		this.#following = true;
		void onInstallFinished((outcome) => {
			if (!this.#ownsOutcome(outcome)) return;
			if (this.#ownsInstallLedger) {
				void takeInstallOutcome().catch(() => null);
			}
			const ready = this.#installedFrom;
			if (!ready) return;
			this.#releaseInstall();
			if (outcome.succeeded) {
				if (this.#ownsInstallLedger) return;
				this.#hide();
				this.#presenter.installed({
					tag: this.#readyTag,
					kind: this.#readyKind,
				});
				return;
			}
			if (!outcome.canceled) {
				this.#presenter.problem(
					installFailedText({
						code: outcome.code,
						component: this.component,
						kind: this.#readyKind,
					}),
				);
			}
			this.#show(ready);
			void this.#settle();
		});
		void onUpdateProgress((progress) => {
			if (progress.component !== this.component) return;
			this.#readyKind = progress.kind;
			const change = stageOf(progress);
			if ("failed" in change) {
				if (change.failed?.kind !== "assetReplaced")
					this.#armedTag = null;
				this.#reportFailure(change.failed);
				return;
			}
			if (change.view.stage !== "ready") {
				if (
					change.view.stage === "paused" &&
					progress.tag === this.#armedTag
				) {
					this.#armedTag = null;
				}
				this.#offerTag = progress.tag;
				this.#show(change.view);
				return;
			}
			this.#autoRefetched = false;
			this.#readyTag = progress.tag;
			const armed = this.#armedTag === progress.tag;
			if (armed) this.#armedTag = null;
			if (this.#installing) return;
			void this.#settleOrHide().then((usable) => {
				if (usable && armed) {
					this.#installOnReturn.runOnceVisible(
						() => void this.#install(),
					);
				}
			});
		});
	}

	async #announceLastInstall(): Promise<void> {
		const outcome = await takeInstallOutcome().catch(() => null);
		if (!outcome) return;
		if (outcome.succeeded) {
			this.#presenter.installed({ tag: null, kind: "update" });
			return;
		}
		if (outcome.canceled) return;
		this.#presenter.problem(
			installFailedText({
				code: outcome.code,
				component: this.component,
				kind: "update",
			}),
		);
	}

	#show(next: StageView): void {
		if (next.stage !== "ready") this.#installOnReturn.forget();
		const offerable = isOffer(next);
		if (this.#dismissed && offerable) {
			this.#shown = next;
			if (this.#visible) this.#hide();
			return;
		}
		this.#shown = next;
		this.#visible = true;
		const showing = this.#showing.next();
		this.#presenter.show({
			view: next,
			kind: this.#readyKind,
			onActivate: () => void this.#activate(),
			onCancel: () =>
				void cancelUpdateDownload(this.component).catch(
					(error: unknown) =>
						this.#problem({
							error,
							fallback: "Couldn't stop the download",
						}),
				),
			onDismiss: () => {
				if (this.#showing.isStale(showing)) return;
				if (offerable) this.#dismissed = true;
				this.#visible = false;
			},
		});
	}

	#hide(): void {
		this.#installOnReturn.forget();
		this.#offerTag = null;
		this.#showing.next();
		this.#visible = false;
		this.#presenter.dismiss();
	}

	#problem({ error, fallback }: { error: unknown; fallback: string }): void {
		this.#presenter.problem(
			updateErrorText(error, {
				fallback,
				component: this.component,
				kind: this.#readyKind,
			}),
		);
	}

	#reportFailure(error: unknown): void {
		const known = asUpdateError(error);
		if (known?.kind === "assetReplaced" && !this.#autoRefetched) {
			this.#autoRefetched = true;
			void this.#downloadAgain();
			return;
		}

		this.#hide();
		this.#problem({ error, fallback: "The update failed" });

		if (known?.kind !== "server") return;

		const { status } = known.detail;
		const refusedForGood = status >= 400 && status < 500 && status !== 429;
		if (refusedForGood) {
			void discardStagedUpdate(this.component).catch(() => undefined);
		}
	}
}
