// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

const { invoke } = vi.hoisted(() => ({
	invoke: vi.fn<(command: string) => Promise<unknown>>(),
}));

vi.mock("@tauri-apps/api/core", async (importOriginal) => ({
	...(await importOriginal<typeof import("@tauri-apps/api/core")>()),
	invoke,
}));

import { resetPlatform, runningOn } from "#lib/test/platform.ts";
import type { SupportedPlatform } from "./os";

async function freshWatch() {
	vi.resetModules();
	return import("./voice-over.svelte");
}

afterEach(() => {
	resetPlatform();
	invoke.mockReset();
	delete window.__iosVoiceOver;
});

describe("the VoiceOver watch", () => {
	it("on iOS starts from what native reports", async () => {
		runningOn("ios");
		invoke.mockResolvedValue(true);
		const { installVoiceOverWatch, voiceOverRunning } = await freshWatch();

		installVoiceOverWatch();
		await vi.waitFor(() => expect(voiceOverRunning()).toBe(true));

		expect(invoke).toHaveBeenCalledWith("voice_over_running");
	});

	it("on iOS follows what native pushes when VoiceOver turns on or off", async () => {
		runningOn("ios");
		invoke.mockResolvedValue(false);
		const { installVoiceOverWatch, voiceOverRunning } = await freshWatch();
		installVoiceOverWatch();

		window.__iosVoiceOver?.(true);
		expect(voiceOverRunning()).toBe(true);
		window.__iosVoiceOver?.(false);
		expect(voiceOverRunning()).toBe(false);
	});

	it("keeps a push that lands before the starting read answers", async () => {
		runningOn("ios");
		let answer: (running: boolean) => void = () => {};
		invoke.mockReturnValue(
			new Promise((resolve) => {
				answer = resolve;
			}),
		);
		const { installVoiceOverWatch, voiceOverRunning } = await freshWatch();
		installVoiceOverWatch();

		window.__iosVoiceOver?.(true);
		answer(false);
		await Promise.resolve();

		expect(voiceOverRunning()).toBe(true);
	});

	for (const platform of [
		"android",
		"linux",
		"macos",
		"windows",
	] satisfies SupportedPlatform[]) {
		it(`reads nothing on ${platform}`, async () => {
			runningOn(platform);
			const { installVoiceOverWatch, voiceOverRunning } =
				await freshWatch();

			installVoiceOverWatch();

			expect(invoke).not.toHaveBeenCalled();
			expect(window.__iosVoiceOver).toBeUndefined();
			expect(voiceOverRunning()).toBe(false);
		});
	}
});
