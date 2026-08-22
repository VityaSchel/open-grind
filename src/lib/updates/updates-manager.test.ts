import { beforeEach, describe, expect, it, vi } from "vitest";

import type { StageView } from "./stage";
import type { InstallOutcome, Progress, Readiness, UpdateError } from "./types";

const api = vi.hoisted(() => ({
	asUpdateError: vi.fn((error: unknown) => error),
	cancelUpdateDownload: vi.fn(),
	checkForUpdate: vi.fn(),
	discardStagedUpdate: vi.fn(),
	getUpdateProgress: vi.fn(),
	getUpdateReadiness: vi.fn(),
	installUpdate: vi.fn(),
	onInstallFinished: vi.fn(),
	onUpdateProgress: vi.fn(),
	openInstallPermissionSettings: vi.fn(),
	startUpdateDownload: vi.fn(),
	takeInstallOutcome: vi.fn(),
}));

const toasts = vi.hoisted(() => ({
	dismissStage: vi.fn(),
	showInstalled: vi.fn(),
	showManualInstall: vi.fn(),
	showProblem: vi.fn(),
	showStage: vi.fn(),
}));

vi.mock("./index", () => api);
vi.mock("./toasts", () => toasts);

type Shown = { view: StageView; onActivate: () => void };

function lastShown(): Shown {
	const calls = toasts.showStage.mock.calls as [Shown][];
	expect(calls.length).toBeGreaterThan(0);
	return calls[calls.length - 1]![0];
}

const ready: Readiness = {
	state: "ready",
	detail: { tag: "v0.2.0", version: "0.2.0", canInstallNow: true },
};
const release = {
	available: true,
	currentVersion: "0.1.0",
	release: { tag: "v0.2.0", version: "0.2.0" },
};

async function settled(): Promise<void> {
	for (let turn = 0; turn < 12; turn++) await Promise.resolve();
}

function resetHarness(): void {
	vi.resetModules();
	vi.clearAllMocks();
	api.asUpdateError.mockImplementation((error: unknown) => error);
	api.discardStagedUpdate.mockResolvedValue(undefined);
	api.getUpdateProgress.mockResolvedValue(null);
	api.getUpdateReadiness.mockResolvedValue(ready);
	api.installUpdate.mockResolvedValue(undefined);
	api.startUpdateDownload.mockResolvedValue(undefined);
	api.takeInstallOutcome.mockResolvedValue(null);
	api.checkForUpdate.mockResolvedValue(release);
}

function progressHandler(): (progress: Progress) => void {
	const calls = api.onUpdateProgress.mock.calls as [
		(progress: Progress) => void,
	][];
	expect(calls.length).toBeGreaterThan(0);
	return calls[0]![0];
}

function installHandler(): (outcome: InstallOutcome) => void {
	const calls = api.onInstallFinished.mock.calls as [
		(outcome: InstallOutcome) => void,
	][];
	expect(calls.length).toBeGreaterThan(0);
	return calls[0]![0];
}

function failure(detail: UpdateError): Progress {
	return {
		tag: "v0.2.0",
		version: "0.2.0",
		phase: "failed",
		detail,
		received: 0,
		total: 0,
	};
}

describe("a staged update that vanished before the install", () => {
	beforeEach(resetHarness);

	it("downloads it again instead of reporting that nothing is staged", async () => {
		const { startUpdateWatch } = await import("./updates-manager");
		await startUpdateWatch();
		expect(lastShown().view.stage).toBe("ready");

		api.installUpdate.mockRejectedValue({ kind: "nothingStaged" });
		api.getUpdateReadiness.mockResolvedValue({ state: "nothingStaged" });

		lastShown().onActivate();
		await settled();

		expect(api.checkForUpdate).toHaveBeenCalledWith("manual");
		expect(api.startUpdateDownload).toHaveBeenCalled();
		expect(toasts.showProblem).not.toHaveBeenCalled();
		expect(lastShown().view.stage).toBe("downloading");
	});

	it("clears the stale toast when the release is gone too", async () => {
		const { startUpdateWatch } = await import("./updates-manager");
		await startUpdateWatch();

		api.installUpdate.mockRejectedValue({ kind: "nothingStaged" });
		api.getUpdateReadiness.mockResolvedValue({ state: "nothingStaged" });
		api.checkForUpdate.mockResolvedValue({
			available: false,
			currentVersion: "0.1.0",
			release: null,
		});

		lastShown().onActivate();
		await settled();

		expect(api.startUpdateDownload).not.toHaveBeenCalled();
		expect(toasts.dismissStage).toHaveBeenCalled();
		expect(toasts.showProblem).not.toHaveBeenCalled();
	});

	it("re-checks and downloads again when the asset was replaced", async () => {
		const { startUpdateWatch } = await import("./updates-manager");
		await startUpdateWatch();
		api.startUpdateDownload.mockClear();
		api.checkForUpdate.mockClear();
		api.getUpdateReadiness.mockResolvedValue({ state: "nothingStaged" });

		progressHandler()(failure({ kind: "assetReplaced" }));
		await settled();

		expect(toasts.showProblem).not.toHaveBeenCalled();
		expect(api.checkForUpdate).toHaveBeenCalledWith("manual");
		expect(api.startUpdateDownload).toHaveBeenCalled();
	});

	it("stops re-downloading a replaced asset after one attempt", async () => {
		const { startUpdateWatch } = await import("./updates-manager");
		await startUpdateWatch();
		api.getUpdateReadiness.mockResolvedValue({ state: "nothingStaged" });

		progressHandler()(failure({ kind: "assetReplaced" }));
		await settled();
		const afterFirst = api.startUpdateDownload.mock.calls.length;

		progressHandler()(failure({ kind: "assetReplaced" }));
		await settled();

		expect(api.startUpdateDownload.mock.calls.length).toBe(afterFirst);
		expect(toasts.showProblem).toHaveBeenCalled();
	});

	it("drops a stage whose release is gone and still checks at launch", async () => {
		api.getUpdateReadiness.mockResolvedValue({
			state: "resumable",
			detail: { tag: "v0.2.0", version: "0.2.0" },
		});
		api.startUpdateDownload.mockRejectedValue({ kind: "nothingStaged" });
		api.checkForUpdate.mockResolvedValue({
			available: false,
			currentVersion: "0.1.0",
			release: null,
		});

		const { startUpdateWatch } = await import("./updates-manager");
		await startUpdateWatch();
		await settled();

		expect(api.discardStagedUpdate).toHaveBeenCalled();
		expect(api.checkForUpdate).toHaveBeenCalledWith("launch");
		expect(toasts.showProblem).not.toHaveBeenCalled();
	});

	it("resumes from disk when there is still something to resume", async () => {
		const { startUpdateWatch } = await import("./updates-manager");
		await startUpdateWatch();

		api.installUpdate.mockRejectedValue({ kind: "nothingStaged" });
		api.getUpdateReadiness.mockResolvedValue({
			state: "resumable",
			detail: { tag: "v0.2.0", version: "0.2.0" },
		});

		lastShown().onActivate();
		await settled();

		expect(api.checkForUpdate).not.toHaveBeenCalled();
		expect(api.startUpdateDownload).toHaveBeenCalled();
		expect(lastShown().view.stage).toBe("downloading");
	});
});

describe("a download the server refused", () => {
	beforeEach(resetHarness);

	it("discards the staged download after a 404", async () => {
		const { startUpdateWatch } = await import("./updates-manager");
		await startUpdateWatch();

		progressHandler()(failure({ kind: "server", detail: { status: 404 } }));
		await settled();

		expect(toasts.showProblem).toHaveBeenCalled();
		expect(api.discardStagedUpdate).toHaveBeenCalled();
	});

	it("keeps it after a 503 so it can resume", async () => {
		const { startUpdateWatch } = await import("./updates-manager");
		await startUpdateWatch();

		progressHandler()(failure({ kind: "server", detail: { status: 503 } }));
		await settled();

		expect(toasts.showProblem).toHaveBeenCalled();
		expect(api.discardStagedUpdate).not.toHaveBeenCalled();
	});

	it("keeps it after a connection drop", async () => {
		const { startUpdateWatch } = await import("./updates-manager");
		await startUpdateWatch();

		progressHandler()(failure({ kind: "network" }));
		await settled();

		expect(toasts.showProblem).toHaveBeenCalled();
		expect(api.discardStagedUpdate).not.toHaveBeenCalled();
	});
});

describe("an install outcome delivered while the app is alive", () => {
	beforeEach(resetHarness);

	it("consumes the persisted copy so the failure toasts once", async () => {
		const { startUpdateWatch } = await import("./updates-manager");
		await startUpdateWatch();
		const consumed = api.takeInstallOutcome.mock.calls.length;

		installHandler()({
			succeeded: false,
			canceled: false,
			message: "The update did not install",
		});
		await settled();

		expect(api.takeInstallOutcome.mock.calls.length).toBe(consumed + 1);
	});
});
