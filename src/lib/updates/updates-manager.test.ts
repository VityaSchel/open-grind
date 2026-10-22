import { beforeEach, describe, expect, it, vi } from "vitest";

import type { StageView } from "./stage";
import type { Progress, UpdateError } from "./types";
import {
	offer,
	progressOf,
	ready,
	resumable,
	settled,
	toastsFake,
	updateApiFake,
} from "./updates-test-helpers";

const fake = updateApiFake();
const toasts = toastsFake();
const { api, readiness, emitProgress, emitOutcome } = fake;

vi.mock("./index", async () => ({
	...(await import("./types")),
	...(await import("./components")),
	...fake.api,
}));
vi.mock("./toasts", () => toasts);

type Shown = { view: StageView; onActivate: () => void };

const RELEASE_TAG = "v0.2.0";
const RAW_REFUSAL =
	"INSTALL_FAILED_VERIFICATION_FAILURE: Package Verification Result";
const nothingStaged = { state: "nothingStaged" } as const;
const gone = { available: false, currentVersion: "0.1.0", release: null };

function lastShown(): Shown {
	const calls = toasts.showStage.mock.calls as [Shown][];
	expect(calls.length).toBeGreaterThan(0);
	return calls[calls.length - 1]![0];
}

function failure(detail: UpdateError): Progress {
	return progressOf("app", {
		tag: RELEASE_TAG,
		version: RELEASE_TAG.slice(1),
		phase: "failed",
		detail,
		total: 0,
	});
}

function resetHarness(): void {
	vi.resetModules();
	vi.clearAllMocks();
	fake.reset();
	readiness.app = ready("update", { tag: RELEASE_TAG });
	api.checkForUpdate.mockResolvedValue(
		offer("update", { component: "app", tag: RELEASE_TAG }),
	);
}

async function startAppWatch(): Promise<void> {
	const { startUpdateWatch } = await import("./updates-manager");
	await startUpdateWatch();
}

describe("a staged update that vanished before the install", () => {
	beforeEach(resetHarness);

	it("downloads it again instead of reporting that nothing is staged", async () => {
		await startAppWatch();
		expect(lastShown().view.stage).toBe("ready");

		readiness.app = nothingStaged;

		lastShown().onActivate();
		await settled();

		expect(api.checkForUpdate).toHaveBeenCalledWith({
			trigger: "manual",
			component: "app",
		});
		expect(api.startUpdateDownload).toHaveBeenCalled();
		expect(toasts.showProblem).not.toHaveBeenCalled();
		expect(lastShown().view.stage).toBe("downloading");
	});

	it("downloads it again when it vanishes as the install starts", async () => {
		await startAppWatch();
		api.getUpdateReadiness.mockResolvedValueOnce(
			ready("update", { tag: RELEASE_TAG }),
		);
		readiness.app = nothingStaged;
		api.installUpdate.mockRejectedValue({ kind: "nothingStaged" });

		lastShown().onActivate();
		await settled();

		expect(api.installUpdate).toHaveBeenCalledOnce();
		expect(api.checkForUpdate).toHaveBeenCalledWith({
			trigger: "manual",
			component: "app",
		});
		expect(api.startUpdateDownload).toHaveBeenCalled();
		expect(toasts.showProblem).not.toHaveBeenCalled();
		expect(lastShown().view.stage).toBe("downloading");
	});

	it("clears the stale toast when the release is gone too", async () => {
		await startAppWatch();

		readiness.app = nothingStaged;
		api.checkForUpdate.mockResolvedValue(gone);

		lastShown().onActivate();
		await settled();

		expect(api.startUpdateDownload).not.toHaveBeenCalled();
		expect(toasts.dismissStage).toHaveBeenCalled();
		expect(toasts.showProblem).not.toHaveBeenCalled();
	});

	it("re-checks and downloads again when the asset was replaced", async () => {
		await startAppWatch();
		api.startUpdateDownload.mockClear();
		api.checkForUpdate.mockClear();
		readiness.app = nothingStaged;

		emitProgress(failure({ kind: "assetReplaced" }));
		await settled();

		expect(toasts.showProblem).not.toHaveBeenCalled();
		expect(api.checkForUpdate).toHaveBeenCalledWith({
			trigger: "manual",
			component: "app",
		});
		expect(api.startUpdateDownload).toHaveBeenCalled();
	});

	it("stops re-downloading a replaced asset after one attempt", async () => {
		await startAppWatch();
		readiness.app = nothingStaged;

		emitProgress(failure({ kind: "assetReplaced" }));
		await settled();
		const afterFirst = api.startUpdateDownload.mock.calls.length;

		emitProgress(failure({ kind: "assetReplaced" }));
		await settled();

		expect(api.startUpdateDownload.mock.calls.length).toBe(afterFirst);
		expect(toasts.showProblem).toHaveBeenCalledExactlyOnceWith({
			title: "The release changed during the download. Try again.",
		});
	});

	it("drops a stage whose release is gone and still checks at launch", async () => {
		readiness.app = resumable("update", { tag: RELEASE_TAG });
		api.startUpdateDownload.mockRejectedValue({ kind: "nothingStaged" });
		api.checkForUpdate.mockResolvedValue(gone);

		await startAppWatch();
		await settled();

		expect(api.discardStagedUpdate).toHaveBeenCalled();
		expect(api.checkForUpdate).toHaveBeenCalledWith({
			trigger: "launch",
			component: "app",
		});
		expect(toasts.showProblem).not.toHaveBeenCalled();
	});

	it("resumes an interrupted download at launch only as a launch request", async () => {
		readiness.app = resumable("update", { tag: RELEASE_TAG });

		await startAppWatch();
		await settled();

		expect(api.startUpdateDownload).toHaveBeenCalledExactlyOnceWith("app", {
			trigger: "launch",
		});
		expect(lastShown().view.stage).toBe("downloading");
	});

	it("leaves an interrupted download paused at launch while automatic checks are off", async () => {
		readiness.app = resumable("update", { tag: RELEASE_TAG });
		api.startUpdateDownload.mockRejectedValueOnce({
			kind: "autoChecksDisabled",
		});

		await startAppWatch();
		await settled();

		expect(lastShown().view.stage).toBe("paused");
		expect(api.checkForUpdate).not.toHaveBeenCalled();
		expect(api.discardStagedUpdate).not.toHaveBeenCalled();
		expect(toasts.showProblem).not.toHaveBeenCalled();

		lastShown().onActivate();
		await settled();

		expect(api.startUpdateDownload).toHaveBeenLastCalledWith("app", {
			trigger: "manual",
		});
		expect(lastShown().view.stage).toBe("downloading");
	});

	it("resumes from disk when there is still something to resume", async () => {
		await startAppWatch();

		readiness.app = resumable("update", { tag: RELEASE_TAG });

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
		await startAppWatch();

		emitProgress(failure({ kind: "server", detail: { status: 404 } }));
		await settled();

		expect(toasts.showProblem).toHaveBeenCalled();
		expect(api.discardStagedUpdate).toHaveBeenCalled();
	});

	it("ignores a failure that belongs to an add-on", async () => {
		await startAppWatch();

		emitProgress({
			...failure({ kind: "server", detail: { status: 404 } }),
			component: "google-oauth",
		});
		await settled();

		expect(api.discardStagedUpdate).not.toHaveBeenCalled();
		expect(toasts.showProblem).not.toHaveBeenCalled();
	});

	it("keeps it after a 503 so it can resume", async () => {
		await startAppWatch();

		emitProgress(failure({ kind: "server", detail: { status: 503 } }));
		await settled();

		expect(toasts.showProblem).toHaveBeenCalled();
		expect(api.discardStagedUpdate).not.toHaveBeenCalled();
	});

	it("keeps it after a connection drop", async () => {
		await startAppWatch();

		emitProgress(failure({ kind: "network" }));
		await settled();

		expect(toasts.showProblem).toHaveBeenCalled();
		expect(api.discardStagedUpdate).not.toHaveBeenCalled();
	});
});

describe("an install outcome recorded before this launch", () => {
	beforeEach(resetHarness);

	it.each([
		["the system refused it", { code: -7, message: RAW_REFUSAL }],
		[
			"the app still runs the old version",
			{ code: null, message: "still running 0.1.0 after the install" },
		],
	])("words a failure where %s", async (_, recorded) => {
		api.takeInstallOutcome.mockResolvedValueOnce({
			succeeded: false,
			canceled: false,
			...recorded,
		});

		await startAppWatch();

		expect(toasts.showProblem).toHaveBeenCalledExactlyOnceWith({
			title: "Couldn't install the update",
		});
	});

	it("says storage ran out when the system reported it", async () => {
		api.takeInstallOutcome.mockResolvedValueOnce({
			succeeded: false,
			canceled: false,
			code: -4,
			message: "INSTALL_FAILED_INSUFFICIENT_STORAGE: Failed to allocate",
		});

		await startAppWatch();

		expect(toasts.showProblem).toHaveBeenCalledExactlyOnceWith({
			title: "Not enough storage to install the update",
		});
	});
});

describe("an install outcome delivered while the app is alive", () => {
	beforeEach(resetHarness);

	it("toasts a live failure once and consumes its persisted copy", async () => {
		await startAppWatch();
		lastShown().onActivate();
		await settled();
		const consumed = api.takeInstallOutcome.mock.calls.length;

		emitOutcome({
			succeeded: false,
			canceled: false,
			code: -7,
			message: RAW_REFUSAL,
		});
		await settled();

		expect(toasts.showProblem).toHaveBeenCalledExactlyOnceWith({
			title: "Couldn't install the update",
		});
		expect(api.takeInstallOutcome.mock.calls.length).toBe(consumed + 1);
	});

	it("ignores an install outcome that belongs to an add-on", async () => {
		await startAppWatch();
		api.takeInstallOutcome.mockClear();

		emitOutcome({
			packageName: "org.opengrind.google_oauth",
			succeeded: false,
			canceled: false,
			code: 5,
			message: "conflicts with the installed app",
		});
		await settled();

		expect(api.takeInstallOutcome).not.toHaveBeenCalled();
		expect(toasts.showProblem).not.toHaveBeenCalled();
	});
});
