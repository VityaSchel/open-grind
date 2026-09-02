// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const toastMock = { error: vi.fn() };
vi.mock("svelte-sonner", () => ({ toast: toastMock }));

const tauri = globalThis as {
	isTauri?: boolean;
	__TAURI_OS_PLUGIN_INTERNALS__?: { platform: string };
};

function runningOn(platform: string) {
	tauri.isTauri = true;
	tauri.__TAURI_OS_PLUGIN_INTERNALS__ = { platform };
}

function hostAnswers(support: CanPlayTypeResult) {
	vi.spyOn(HTMLMediaElement.prototype, "canPlayType").mockReturnValue(
		support,
	);
}

async function freshSession() {
	vi.resetModules();
	return await import("./video-codecs");
}

beforeEach(() => {
	toastMock.error.mockClear();
	hostAnswers("");
});

afterEach(() => {
	vi.restoreAllMocks();
	delete tauri.isTauri;
	delete tauri.__TAURI_OS_PLUGIN_INTERNALS__;
});

describe("warnAboutMissingVideoCodecs", () => {
	it("names the GStreamer packages when the host cannot decode H.264", async () => {
		runningOn("linux");
		const { warnAboutMissingVideoCodecs, UNDECODABLE_VIDEO_ON_LINUX } =
			await freshSession();

		warnAboutMissingVideoCodecs();

		expect(toastMock.error).toHaveBeenCalledWith(
			UNDECODABLE_VIDEO_ON_LINUX,
			expect.objectContaining({ id: expect.any(String) }),
		);
	});

	it("warns once, not on every video the session opens", async () => {
		runningOn("linux");
		const { warnAboutMissingVideoCodecs } = await freshSession();

		warnAboutMissingVideoCodecs();
		warnAboutMissingVideoCodecs();
		warnAboutMissingVideoCodecs();

		expect(toastMock.error).toHaveBeenCalledTimes(1);
	});

	it("stays quiet when the host can decode H.264", async () => {
		runningOn("linux");
		hostAnswers("probably");
		const { warnAboutMissingVideoCodecs } = await freshSession();

		warnAboutMissingVideoCodecs();

		expect(toastMock.error).not.toHaveBeenCalled();
	});

	it("stays quiet off Linux, where the packages named would be wrong", async () => {
		runningOn("macos");
		const { warnAboutMissingVideoCodecs } = await freshSession();

		warnAboutMissingVideoCodecs();

		expect(toastMock.error).not.toHaveBeenCalled();
	});
});
