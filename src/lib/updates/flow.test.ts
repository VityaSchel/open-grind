import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ComponentKey } from "./components";
import type { CheckResult } from "./types";
import {
	flowFor,
	offer,
	outcomeOf,
	progressOf,
	ready,
	resumable,
	settled,
	unpublished,
	updateApiFake,
	upToDate,
} from "./updates-test-helpers";

const fake = updateApiFake();
const { api, readiness, emitProgress, emitOutcome } = fake;

vi.mock("./index", async () => ({
	...(await import("./types")),
	...(await import("./components")),
	...fake.api,
}));

beforeEach(() => {
	vi.resetModules();
	fake.reset();
});

describe("an add-on update flow", () => {
	it("offers a verified update at launch", async () => {
		readiness["google-oauth"] = ready("update");
		const { flow, view } = await flowFor("google-oauth");

		await flow.start();

		expect(view.events).toEqual(["show:ready"]);
		expect(api.takeInstallOutcome).not.toHaveBeenCalled();
	});

	it("does not resume a first-install download at launch", async () => {
		readiness["google-oauth"] = resumable("install");
		const { flow, view } = await flowFor("google-oauth");

		await flow.start();

		expect(api.startUpdateDownload).not.toHaveBeenCalled();
		expect(view.events).toEqual([]);
	});

	it("leaves a first-install download to the sign-in screen at launch", async () => {
		readiness["google-oauth"] = ready("install");
		const { flow, view } = await flowFor("google-oauth");

		await flow.start();

		expect(view.events).toEqual([]);
		expect(api.checkForUpdate).toHaveBeenCalledWith({
			trigger: "launch",
			component: "google-oauth",
		});
	});

	it("labels a first install it resumes at launch as an install", async () => {
		api.getUpdateProgress.mockResolvedValue(
			progressOf("google-oauth", { kind: "install", received: 40 }),
		);
		const { flow, view } = await flowFor("google-oauth");

		await flow.start();
		await flow.withdrawUpdate();

		expect(view.events).toEqual(["show:downloading"]);
		expect(view.shownKind()).toBe("install");
		expect(api.discardStagedUpdate).not.toHaveBeenCalled();
	});

	it("labels a download by the kind its progress reports", async () => {
		const { flow, view } = await flowFor("google-oauth");
		await flow.start();

		emitProgress(
			progressOf("google-oauth", { kind: "install", phase: "verifying" }),
		);
		await flow.withdrawUpdate();

		expect(view.events).toEqual(["show:verifying"]);
		expect(view.shownKind()).toBe("install");
		expect(api.discardStagedUpdate).not.toHaveBeenCalled();
	});

	it("does not adopt a running download that belongs to the app", async () => {
		api.getUpdateProgress.mockResolvedValue(progressOf("app"));
		const { flow, view } = await flowFor("google-oauth");

		await flow.start();

		expect(api.startUpdateDownload).not.toHaveBeenCalled();
		expect(view.events).toEqual([]);
	});

	it("never offers a first install from a background check", async () => {
		api.checkForUpdate.mockResolvedValue(offer("install"));
		const { flow, view } = await flowFor("google-oauth");

		await flow.start();

		expect(view.events).toEqual([]);
	});

	it("announces its own success and clears the stage", async () => {
		readiness["google-oauth"] = ready("update");
		const { flow, view } = await flowFor("google-oauth");
		await flow.start();
		view.activate();
		await settled();

		emitOutcome(outcomeOf("google-oauth"));
		await settled();

		expect(view.events.slice(-2)).toEqual([
			"dismiss",
			"installed:update:v1.2.0",
		]);
		expect(api.takeInstallOutcome).not.toHaveBeenCalled();
	});

	it("ignores its own outcome when no install is in flight", async () => {
		readiness["google-oauth"] = ready("update");
		const { flow, view } = await flowFor("google-oauth");
		await flow.start();
		const before = [...view.events];

		emitOutcome(outcomeOf("google-oauth"));
		await settled();

		expect(view.events).toEqual(before);
	});

	it("does not strand a download that a swiped offer cancels", async () => {
		api.checkForUpdate.mockResolvedValue(offer("update"));
		const { flow, view } = await flowFor("google-oauth");
		await flow.start();
		view.swipe();

		emitProgress(progressOf("google-oauth", { received: 40 }));
		emitProgress(
			progressOf("google-oauth", { phase: "canceled", received: 40 }),
		);
		await settled();

		expect(flow.busy).toBe(false);
	});

	it("clears the verifying stage when the finished download is refused", async () => {
		api.checkForUpdate.mockResolvedValue(offer("update"));
		const { flow, view } = await flowFor("google-oauth");
		await flow.start();
		view.activate();
		await settled();
		emitProgress(progressOf("google-oauth", { phase: "verifying" }));

		emitProgress(
			progressOf("google-oauth", { phase: "ready", received: 100 }),
		);
		await settled();

		expect(view.events.slice(-2)).toEqual(["show:verifying", "dismiss"]);
		expect(flow.busy).toBe(false);
		expect(api.installUpdate).not.toHaveBeenCalled();
	});

	it("ignores an unnamed outcome, which only a self-install produces", async () => {
		readiness["google-oauth"] = ready("update");
		const { flow, view } = await flowFor("google-oauth");
		await flow.start();
		view.activate();
		await settled();
		const before = [...view.events];

		emitOutcome({ succeeded: false, canceled: false, message: "boom" });
		await settled();

		expect(view.events).toEqual(before);
	});
});

describe("the app's own flow", () => {
	it("leaves a live success to the relaunch that follows it", async () => {
		readiness.app = ready("update", { tag: "v0.2.0" });
		const { flow, view } = await flowFor("app");
		await flow.start();
		view.activate();
		await settled();

		emitOutcome(outcomeOf("app"));
		await settled();

		expect(view.events.at(-1)).toBe("show:installing");
	});
});

describe("a download that fails verification", () => {
	it.each<[ComponentKey, string]>([
		["google-oauth", "Couldn’t verify the Open Grind Google OAuth app"],
		["app", "Couldn’t verify the update"],
	])("names what the %s flow downloaded", async (component, message) => {
		api.checkForUpdate.mockResolvedValue(offer("update", { component }));
		const { flow, view } = await flowFor(component);
		await flow.start();
		api.startUpdateDownload.mockRejectedValue({ kind: "signature" });

		view.activate();
		await settled();

		expect(view.problems()).toEqual([`problem:${message}`]);
	});
});

describe("the hourly check", () => {
	const HOUR_MS = 60 * 60 * 1000;

	beforeEach(() => {
		api.checkForUpdate.mockResolvedValue(
			offer("update", { component: "app", tag: "v0.2.0" }),
		);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("checks every hour and only once per start", async () => {
		const { flow } = await flowFor("app");
		vi.useFakeTimers();

		await flow.start();
		await flow.start();
		expect(api.checkForUpdate).toHaveBeenCalledTimes(1);

		await vi.advanceTimersByTimeAsync(HOUR_MS);

		expect(api.checkForUpdate).toHaveBeenCalledTimes(2);
		expect(api.checkForUpdate).toHaveBeenLastCalledWith({
			trigger: "automatic",
			component: "app",
		});
	});

	it("keeps a downloaded update on screen", async () => {
		readiness.app = ready("update", { tag: "v0.2.0" });
		const { flow, view } = await flowFor("app");
		vi.useFakeTimers();
		await flow.start();

		await vi.advanceTimersByTimeAsync(HOUR_MS);

		expect(view.events).toEqual(["show:ready"]);
	});

	it.each([
		["no longer finds the update", upToDate],
		["finds the update again", offer("update", { component: "app" })],
	])(
		"leaves a download tapped during the check alone when it %s",
		async (_, result) => {
			const { flow, view } = await flowFor("app");
			vi.useFakeTimers();
			await flow.start();
			let answer: (found: CheckResult) => void = () => {};
			api.checkForUpdate.mockReturnValue(
				new Promise((resolve) => {
					answer = resolve;
				}),
			);
			await vi.advanceTimersByTimeAsync(HOUR_MS);

			view.activate();
			await vi.advanceTimersByTimeAsync(0);
			answer(result);
			await vi.advanceTimersByTimeAsync(0);

			expect(view.events).toEqual(["show:available", "show:downloading"]);
		},
	);

	it("keeps an install that awaits its outcome busy", async () => {
		readiness.app = ready("update", { tag: "v0.2.0" });
		const { flow, view } = await flowFor("app");
		vi.useFakeTimers();
		await flow.start();
		view.activate();
		await vi.advanceTimersByTimeAsync(0);

		await vi.advanceTimersByTimeAsync(HOUR_MS);

		expect(flow.busy).toBe(true);
		expect(view.events.at(-1)).toBe("show:installing");
	});
});

describe("checking on request", () => {
	it("offers an update it found", async () => {
		api.checkForUpdate.mockResolvedValue(offer("update"));
		const { flow, view } = await flowFor("google-oauth");

		expect(await flow.checkNow()).toBe("offered");
		expect(api.checkForUpdate).toHaveBeenCalledWith({
			trigger: "manual",
			component: "google-oauth",
		});
		expect(view.events).toEqual(["show:available"]);
	});

	it("shows a swiped offer again", async () => {
		api.checkForUpdate.mockResolvedValue(offer("update"));
		const { flow, view } = await flowFor("google-oauth");
		await flow.start();
		view.swipe();

		expect(await flow.checkNow()).toBe("offered");
		expect(view.events).toEqual(["show:available", "show:available"]);
	});

	it.each([
		["an up-to-date add-on", upToDate],
		["an unpublished add-on", unpublished],
		["a first install", offer("install")],
	])("reports %s as nothing to offer, without a toast", async (_, result) => {
		api.checkForUpdate.mockResolvedValue(result);
		const { flow, view } = await flowFor("google-oauth");

		expect(await flow.checkNow({ reportFailure: true })).toBe("current");
		expect(view.events).toEqual([]);
	});

	it("reports a stage already on screen without checking again", async () => {
		api.checkForUpdate.mockResolvedValue(offer("update"));
		const { flow, view } = await flowFor("google-oauth");
		await flow.start();
		api.checkForUpdate.mockClear();

		expect(await flow.checkNow()).toBe("busy");

		view.activate();
		await settled();
		expect(await flow.checkNow()).toBe("busy");
		expect(api.checkForUpdate).not.toHaveBeenCalled();
	});

	it("reports an install awaiting its outcome as busy", async () => {
		readiness["google-oauth"] = ready("update");
		const { flow, view } = await flowFor("google-oauth");
		await flow.start();
		view.activate();
		await settled();
		view.swipe();

		expect(await flow.checkNow()).toBe("busy");
	});

	it("reports a download that started during the check as busy", async () => {
		const { flow, view } = await flowFor("google-oauth");
		let answer: (found: CheckResult) => void = () => {};
		api.checkForUpdate.mockReturnValue(
			new Promise((resolve) => {
				answer = resolve;
			}),
		);

		const checking = flow.checkNow();
		emitProgress(progressOf("google-oauth", { received: 40 }));
		answer(offer("update"));

		expect(await checking).toBe("busy");
		expect(view.events).toEqual(["show:downloading"]);
	});

	it("stays quiet about an unverifiable release index unless asked to report", async () => {
		api.checkForUpdate.mockRejectedValue({ kind: "unsigned" });
		const { flow, view } = await flowFor("google-oauth");

		expect(await flow.checkNow({ reportFailure: false })).toBe("failed");
		expect(view.events).toEqual([]);
	});

	it("still reports an unverifiable release index found at launch", async () => {
		api.checkForUpdate.mockRejectedValue({ kind: "unsigned" });
		const { flow, view } = await flowFor("google-oauth");

		await flow.start();

		expect(view.problems()).toEqual([
			"problem:Couldn’t verify the Open Grind Google OAuth app",
		]);
	});

	it("toasts a failed check only when asked to", async () => {
		api.checkForUpdate.mockRejectedValue({ kind: "network" });
		const { flow, view } = await flowFor("google-oauth");

		expect(await flow.checkNow()).toBe("failed");
		expect(view.problems()).toEqual([]);

		expect(await flow.checkNow({ reportFailure: true })).toBe("failed");
		expect(view.problems()).toEqual([
			"problem:Couldn’t reach the release server",
		]);
	});
});

describe("installing on request", () => {
	it("runs check, download and install from one tap", async () => {
		api.checkForUpdate.mockResolvedValue(offer("install"));
		const { flow, view } = await flowFor("google-oauth");

		await flow.installNow();
		expect(api.checkForUpdate).toHaveBeenCalledWith({
			trigger: "manual",
			component: "google-oauth",
		});
		expect(api.installUpdate).not.toHaveBeenCalled();

		readiness["google-oauth"] = ready("install");
		emitProgress(
			progressOf("google-oauth", {
				kind: "install",
				phase: "ready",
				received: 100,
			}),
		);
		await settled();

		expect(api.installUpdate).toHaveBeenCalledWith("google-oauth");
		expect(view.events.at(-1)).toBe("show:installing");
	});

	it("does not prompt again after the system dialog is cancelled", async () => {
		api.checkForUpdate.mockResolvedValue(offer("install"));
		const { flow } = await flowFor("google-oauth");
		await flow.installNow();
		readiness["google-oauth"] = ready("install");
		const downloaded = progressOf("google-oauth", {
			kind: "install",
			phase: "ready",
			received: 100,
		});
		emitProgress(downloaded);
		await settled();

		emitOutcome(
			outcomeOf("google-oauth", { succeeded: false, canceled: true }),
		);
		await settled();
		emitProgress(downloaded);
		await settled();

		expect(api.installUpdate).toHaveBeenCalledTimes(1);
	});

	it("keeps the tap as consent when the asset is replaced mid-download", async () => {
		api.checkForUpdate.mockResolvedValue(offer("install"));
		const { flow } = await flowFor("google-oauth");
		await flow.installNow();

		emitProgress(
			progressOf("google-oauth", {
				kind: "install",
				phase: "failed",
				detail: { kind: "assetReplaced" },
			}),
		);
		await settled();
		expect(api.startUpdateDownload).toHaveBeenCalledTimes(2);

		readiness["google-oauth"] = ready("install");
		emitProgress(
			progressOf("google-oauth", {
				kind: "install",
				phase: "ready",
				received: 100,
			}),
		);
		await settled();

		expect(api.installUpdate).toHaveBeenCalledWith("google-oauth");
	});

	it("keeps the tap as consent when the download is refused because the asset was replaced", async () => {
		api.checkForUpdate.mockResolvedValue(offer("install"));
		api.startUpdateDownload.mockRejectedValueOnce({
			kind: "assetReplaced",
		});
		const { flow } = await flowFor("google-oauth");
		await flow.installNow();
		await settled();
		expect(api.startUpdateDownload).toHaveBeenCalledTimes(2);

		readiness["google-oauth"] = ready("install");
		emitProgress(
			progressOf("google-oauth", {
				kind: "install",
				phase: "ready",
				received: 100,
			}),
		);
		await settled();

		expect(api.installUpdate).toHaveBeenCalledWith("google-oauth");
	});

	it("does not install a download the user cancelled and resumed from the toast", async () => {
		api.checkForUpdate.mockResolvedValue(offer("install"));
		const { flow, view } = await flowFor("google-oauth");
		await flow.installNow();

		emitProgress(
			progressOf("google-oauth", {
				kind: "install",
				phase: "canceled",
				received: 40,
			}),
		);
		view.activate();
		await settled();
		expect(api.startUpdateDownload).toHaveBeenCalledTimes(2);

		readiness["google-oauth"] = ready("install");
		emitProgress(
			progressOf("google-oauth", {
				kind: "install",
				phase: "ready",
				received: 100,
			}),
		);
		await settled();

		expect(api.installUpdate).not.toHaveBeenCalled();
	});

	it("takes a retry tap after a download failed", async () => {
		api.checkForUpdate.mockResolvedValue(offer("install"));
		const { flow } = await flowFor("google-oauth");
		await flow.installNow();
		emitProgress(
			progressOf("google-oauth", {
				kind: "install",
				phase: "failed",
				detail: { kind: "network" },
			}),
		);
		await settled();

		readiness["google-oauth"] = resumable("install");
		await flow.installNow();

		expect(api.startUpdateDownload).toHaveBeenCalledTimes(2);
	});

	it("ignores a second tap while its download is on screen", async () => {
		api.checkForUpdate.mockResolvedValue(offer("install"));
		const { flow } = await flowFor("google-oauth");
		await flow.installNow();
		emitProgress(
			progressOf("google-oauth", { kind: "install", received: 40 }),
		);

		readiness["google-oauth"] = resumable("install");
		await flow.installNow();

		expect(api.startUpdateDownload).toHaveBeenCalledTimes(1);
	});

	it("stays installing when a ready progress arrives mid-install", async () => {
		api.installUpdate.mockReturnValue(new Promise(() => {}));
		readiness["google-oauth"] = ready("install");
		const { flow, view } = await flowFor("google-oauth");
		void flow.installNow();
		await settled();

		emitProgress(
			progressOf("google-oauth", {
				kind: "install",
				phase: "ready",
				received: 100,
			}),
		);
		await settled();

		expect(view.events.at(-1)).toBe("show:installing");
	});

	it("installs the release the backend actually started, not the stale stage", async () => {
		readiness["google-oauth"] = resumable("install", { tag: "v1.1.0" });
		api.startUpdateDownload.mockResolvedValue(
			progressOf("google-oauth", {
				kind: "install",
				tag: "v1.3.0",
				version: "1.3.0",
			}),
		);
		const { flow } = await flowFor("google-oauth");

		await flow.installNow();
		readiness["google-oauth"] = ready("install", { tag: "v1.3.0" });
		emitProgress(
			progressOf("google-oauth", {
				kind: "install",
				phase: "ready",
				tag: "v1.3.0",
			}),
		);
		await settled();

		expect(api.installUpdate).toHaveBeenCalledWith("google-oauth");
	});

	it("says installed, not updated, when a first install finishes", async () => {
		readiness["google-oauth"] = ready("install");
		const { flow, view } = await flowFor("google-oauth");
		await flow.installNow();

		emitOutcome(outcomeOf("google-oauth"));
		await settled();

		expect(view.events.at(-1)).toBe("installed:install:v1.2.0");
	});

	it("ignores a ready download it did not ask for", async () => {
		api.checkForUpdate.mockResolvedValue(offer("install"));
		const { flow } = await flowFor("google-oauth");
		await flow.installNow();

		readiness["google-oauth"] = ready("install", { tag: "v9.9.9" });
		emitProgress(
			progressOf("google-oauth", {
				kind: "install",
				phase: "ready",
				tag: "v9.9.9",
			}),
		);
		await settled();

		expect(api.installUpdate).not.toHaveBeenCalled();
	});

	it("installs a download that is already verified without fetching again", async () => {
		readiness["google-oauth"] = ready("install");
		const { flow } = await flowFor("google-oauth");

		await flow.installNow();

		expect(api.checkForUpdate).not.toHaveBeenCalled();
		expect(api.installUpdate).toHaveBeenCalledWith("google-oauth");
	});

	it("checks instead of stopping when the partial download is refused", async () => {
		readiness["google-oauth"] = resumable("install", { tag: "v1.1.0" });
		api.startUpdateDownload.mockRejectedValueOnce({
			kind: "nothingStaged",
		});
		api.checkForUpdate.mockResolvedValue(unpublished);
		const { flow, view } = await flowFor("google-oauth");

		await flow.installNow();

		expect(api.checkForUpdate).toHaveBeenCalledWith({
			trigger: "manual",
			component: "google-oauth",
		});
		expect(view.events.at(-1)).toBe(
			"problem:No Open Grind Google OAuth app release is published yet",
		);
	});

	it("shows the offer again when a tap follows a swipe and the download is canceled", async () => {
		api.checkForUpdate.mockResolvedValue(offer("update"));
		const { flow, view } = await flowFor("google-oauth");
		await flow.start();
		view.swipe();
		readiness["google-oauth"] = resumable("update");

		await flow.installNow();
		emitProgress(
			progressOf("google-oauth", { phase: "canceled", received: 10 }),
		);
		await settled();

		expect(flow.busy).toBe(false);
		expect(view.events.at(-1)).toBe("show:paused");

		await flow.installNow();

		expect(api.startUpdateDownload).toHaveBeenCalledTimes(2);
	});

	it("shows the offer again when a tap follows a swipe and the queue is busy", async () => {
		api.checkForUpdate.mockResolvedValue(offer("update"));
		const { flow, view } = await flowFor("google-oauth");
		await flow.start();
		view.swipe();
		readiness["google-oauth"] = resumable("update");
		api.startUpdateDownload.mockRejectedValue({ kind: "busy" });

		await flow.installNow();

		expect(flow.busy).toBe(false);
		expect(view.events.slice(-3)).toEqual([
			"show:downloading",
			"show:paused",
			"problem:Another download is already running",
		]);
	});

	it("tells an installed, current add-on apart from an unpublished one", async () => {
		const { flow, view } = await flowFor("google-oauth");

		await flow.installNow();
		api.checkForUpdate.mockResolvedValue(unpublished);
		await flow.installNow();

		expect(view.events).toEqual([
			"upToDate",
			"problem:No Open Grind Google OAuth app release is published yet",
		]);
	});

	it("says no app release is published yet when the index has none", async () => {
		api.checkForUpdate.mockResolvedValue(unpublished);
		const { flow, view } = await flowFor("app");

		await flow.installNow();

		expect(view.events).toEqual([
			"problem:No Open Grind release is published yet",
		]);
	});
});
