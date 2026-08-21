import { beforeEach, describe, expect, it, vi } from "vitest";

const { invokeMock, listenMock, isTauriMock } = vi.hoisted(() => ({
	invokeMock: vi.fn(),
	listenMock: vi.fn(),
	isTauriMock: vi.fn(() => true),
}));

vi.mock("@tauri-apps/api/core", () => ({
	invoke: invokeMock,
	isTauri: isTauriMock,
}));
vi.mock("@tauri-apps/api/event", () => ({ listen: listenMock }));

import {
	asUpdateError,
	cancelUpdateDownload,
	checkForUpdate,
	getUpdateCapability,
	getUpdateProgress,
	getUpdateReadiness,
	installUpdate,
	onUpdateProgress,
	setAutomaticUpdateChecks,
	startUpdateDownload,
} from "$lib/updates";
import { stageOf } from "$lib/updates/stage";
import type { Progress } from "$lib/updates/types";

const release = {
	tag: "v0.1.0-beta.4",
	version: "0.1.0-beta.4",
	notes: "# notes",
	publishedAt: "2026-07-19T19:05:36+02:00",
	payload: {
		name: "open-grind-0.1.0-beta.4.apk",
		url: "https://git.opengrind.org/open-grind/open-grind/releases/download/v0.1.0-beta.4/open-grind-0.1.0-beta.4.apk",
		uuid: "bb49c042-1273-4561-8ede-b42f947e4fda",
		size: 72294080,
	},
	signature: {
		name: "open-grind-0.1.0-beta.4.apk.minisig",
		url: "https://git.opengrind.org/open-grind/open-grind/releases/download/v0.1.0-beta.4/open-grind-0.1.0-beta.4.apk.minisig",
		uuid: "c45b10ab-8fb5-4607-8fa9-bfb03843468d",
		size: 228,
	},
};

beforeEach(() => {
	invokeMock.mockReset();
	listenMock.mockReset();
	isTauriMock.mockReturnValue(true);
});

describe("update checks", () => {
	it("passes the trigger through and reports an available release", async () => {
		invokeMock.mockResolvedValue({
			available: true,
			currentVersion: "0.1.0-beta.3",
			release,
		});

		const result = await checkForUpdate("automatic");

		expect(invokeMock).toHaveBeenCalledWith("update_check", {
			trigger: "automatic",
		});
		expect(result.available).toBe(true);
		expect(result.release?.version).toBe("0.1.0-beta.4");
	});

	it("reports no update when the backend found none", async () => {
		invokeMock.mockResolvedValue({
			available: false,
			currentVersion: "0.1.0-beta.3",
			release: null,
		});

		const result = await checkForUpdate("manual");

		expect(result.available).toBe(false);
		expect(result.release).toBeNull();
	});

	it("rejects a payload that does not match the backend contract", async () => {
		invokeMock.mockResolvedValue({ available: "yes" });
		await expect(checkForUpdate("manual")).rejects.toThrow();
	});
});

describe("capability and readiness", () => {
	it("never reaches the backend outside a Tauri build", async () => {
		isTauriMock.mockReturnValue(false);

		expect(await getUpdateCapability()).toEqual({
			state: "unsupported",
			detail: { reason: "noReleaseArtifacts", detail: { target: "web" } },
		});
		expect(await getUpdateReadiness()).toMatchObject({
			state: "unsupported",
		});
		expect(invokeMock).not.toHaveBeenCalled();
	});

	it("parses an externally managed install", async () => {
		invokeMock.mockResolvedValue({
			state: "unsupported",
			detail: {
				reason: "externallyManaged",
				detail: { installer: "org.fdroid.fdroid" },
			},
		});

		const capability = await getUpdateCapability();

		expect(capability).toEqual({
			state: "unsupported",
			detail: {
				reason: "externallyManaged",
				detail: { installer: "org.fdroid.fdroid" },
			},
		});
	});

	it("parses a staged update that is ready to install", async () => {
		invokeMock.mockResolvedValue({
			state: "ready",
			detail: {
				tag: "v0.1.0-beta.4",
				version: "0.1.0-beta.4",
				canInstallNow: true,
			},
		});

		const readiness = await getUpdateReadiness();

		expect(readiness.state).toBe("ready");
	});

	it("parses the nothing-staged case that follows a cleared cache", async () => {
		invokeMock.mockResolvedValue({ state: "nothingStaged" });
		expect(await getUpdateReadiness()).toEqual({ state: "nothingStaged" });
	});
});

describe("download and install", () => {
	it("returns progress for a started download", async () => {
		invokeMock.mockResolvedValue({
			tag: "v0.1.0-beta.4",
			version: "0.1.0-beta.4",
			phase: "downloading",
			received: 0,
			total: 72294080,
		});

		const progress = await startUpdateDownload();

		expect(invokeMock).toHaveBeenCalledWith("update_download");
		expect(progress.phase).toBe("downloading");
	});

	it("carries the failure detail on a failed transfer", async () => {
		invokeMock.mockResolvedValue({
			tag: "v0.1.0-beta.4",
			version: "0.1.0-beta.4",
			phase: "failed",
			detail: {
				kind: "signature",
				detail: "signature: invalid signed hash value",
			},
			received: 72294080,
			total: 72294080,
		});

		const progress = await getUpdateProgress();

		expect(progress?.phase).toBe("failed");
		expect(progress?.detail?.kind).toBe("signature");
	});

	it("reports no progress before anything has been attempted", async () => {
		invokeMock.mockResolvedValue(null);
		expect(await getUpdateProgress()).toBeNull();
	});

	it("asks the backend to stop an in-flight download", async () => {
		invokeMock.mockResolvedValue(null);
		await cancelUpdateDownload();
		expect(invokeMock).toHaveBeenCalledWith("update_cancel_download");
	});

	it("hands off to the system installer without a payload of its own", async () => {
		invokeMock.mockResolvedValue(null);
		await installUpdate();
		expect(invokeMock).toHaveBeenCalledWith("update_install");
	});

	it("forwards the opt-in flag when turning automatic checks on", async () => {
		invokeMock.mockResolvedValue({
			autoCheck: true,
			nextCheckAt: 1785000000,
		});

		const settings = await setAutomaticUpdateChecks(true);

		expect(invokeMock).toHaveBeenCalledWith("update_set_auto_check", {
			enabled: true,
		});
		expect(settings.autoCheck).toBe(true);
	});
});

describe("progress events", () => {
	it("hands parsed payloads to the caller and drops malformed ones", () => {
		const handler = vi.fn();
		void onUpdateProgress(handler);

		const [event, callback] = listenMock.mock.calls[0] as [
			string,
			(event: { payload: unknown }) => void,
		];
		expect(event).toBe("update:progress");

		callback({
			payload: {
				tag: "v0.1.0-beta.4",
				version: "0.1.0-beta.4",
				phase: "verifying",
				received: 72294080,
				total: 72294080,
			},
		});
		expect(handler).toHaveBeenCalledOnce();

		vi.spyOn(console, "error").mockImplementation(() => {});
		callback({ payload: { phase: "nonsense" } });
		expect(handler).toHaveBeenCalledOnce();
	});
});

describe("error mapping", () => {
	it("recognizes backend update errors and ignores anything else", () => {
		expect(asUpdateError({ kind: "needsUnknownSources" })?.kind).toBe(
			"needsUnknownSources",
		);
		expect(
			asUpdateError({
				kind: "checkTooSoon",
				detail: { retryAfterSecs: 60 },
			}),
		).toEqual({ kind: "checkTooSoon", detail: { retryAfterSecs: 60 } });
		expect(asUpdateError(new Error("boom"))).toBeUndefined();
		expect(asUpdateError({ kind: "Banned" })).toBeUndefined();
	});
});

describe("stage mapping", () => {
	const progress = (phase: string, received: number) =>
		stageOf({
			tag: "v0.1.0-beta.4",
			version: "0.1.0-beta.4",
			phase,
			received,
			total: 72294080,
		} as Progress);

	it("offers a cancelled download again instead of dropping it", () => {
		const change = progress("canceled", 12345678);

		expect(change).toEqual({
			view: { stage: "paused", received: 12345678, total: 72294080 },
		});
	});

	it("keeps the byte counts a resumed download starts from", () => {
		const change = progress("downloading", 12345678);

		expect(change).toEqual({
			view: { stage: "downloading", received: 12345678, total: 72294080 },
		});
	});
});
