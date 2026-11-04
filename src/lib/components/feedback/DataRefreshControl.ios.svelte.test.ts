// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { installVoiceOverWatch } from "#lib/platform/voice-over.svelte.ts";
import { resetPlatform, runningOn } from "#lib/test/platform.ts";
import {
	mountAtRest,
	TWEEN_MS,
	useRefreshControlHarness,
} from "./refresh-control-test-harness";

const IOS_ARM_PX = 58;

const reducedMotion = vi.hoisted(() => ({ current: false }));
const { invoke } = vi.hoisted(() => ({
	invoke: vi.fn<(command: string) => Promise<unknown>>(),
}));

vi.mock("@tauri-apps/api/core", async (importOriginal) => ({
	...(await importOriginal<typeof import("@tauri-apps/api/core")>()),
	invoke,
}));

vi.mock("svelte/motion", async (importOriginal) => ({
	...(await importOriginal<typeof import("svelte/motion")>()),
	prefersReducedMotion: reducedMotion,
}));

const voiceOver = (running: boolean) => window.__iosVoiceOver?.(running);

beforeEach(() => {
	runningOn("ios");
	invoke.mockResolvedValue(false);
	installVoiceOverWatch();
	voiceOver(false);
});

afterEach(() => {
	resetPlatform();
	delete window.__iosVoiceOver;
});

describe("the refresh control on iOS", () => {
	useRefreshControlHarness({ reducedMotion });

	it("fills the spinner's ticks with the rubber band and refreshes when the finger lifts past the line", async () => {
		const view = await mountAtRest("top");

		await view.fingerDown();
		await view.moveBandTo({ px: IOS_ARM_PX / 2, pulledByWheel: false });
		expect(view.phase()).toBe("pulling");
		expect(view.ticks()).not.toBeNull();
		expect(view.ticks()!.hasAttribute("data-spinning")).toBe(false);
		expect(view.disc()).toBeNull();
		expect(view.bandText()).toBe("");

		await view.moveBandTo({ px: IOS_ARM_PX + 6, pulledByWheel: false });
		expect(view.phase()).toBe("armed");
		expect(view.onrefresh).not.toHaveBeenCalled();

		await view.liftFinger();
		expect(view.onrefresh).toHaveBeenCalledOnce();
		expect(view.ticks()!.hasAttribute("data-spinning")).toBe(true);
	});

	it("cancels a pull eased back under the line before the finger lifts", async () => {
		const view = await mountAtRest("top");

		await view.fingerDown();
		await view.moveBandTo({ px: IOS_ARM_PX + 6, pulledByWheel: false });
		await view.moveBandTo({ px: IOS_ARM_PX - 20, pulledByWheel: false });
		await view.liftFinger();

		expect(view.onrefresh).not.toHaveBeenCalled();
		expect(view.phase()).toBe("idle");
	});

	it("does not arm at the band that arms the disc elsewhere", async () => {
		const view = await mountAtRest("top");

		await view.fingerDown();
		await view.moveBandTo({ px: 24, pulledByWheel: false });
		await view.liftFinger();

		expect(view.onrefresh).not.toHaveBeenCalled();
	});

	it("leaves a bounce with no finger down alone", async () => {
		const view = await mountAtRest("top");

		await view.moveBandTo({ px: IOS_ARM_PX * 2, pulledByWheel: false });
		await view.releaseBand();

		expect(view.phase()).toBe("idle");
		expect(view.onrefresh).not.toHaveBeenCalled();
		expect(view.ticks()).toBeNull();
	});

	it("pulls a bottom-anchored list up past its floor the same way", async () => {
		const view = await mountAtRest("bottom");

		await view.fingerDown();
		await view.moveBandTo({ px: IOS_ARM_PX + 6, pulledByWheel: false });
		await view.liftFinger();

		expect(view.onrefresh).toHaveBeenCalledOnce();
	});

	it("spins the ticks instead of the disc for an automatic refresh", async () => {
		const view = await mountAtRest("top");

		await view.setUpdating(true);

		expect(view.disc()).toBeNull();
		expect(view.ticks()!.hasAttribute("data-spinning")).toBe(true);
	});

	it("keeps the Refresh button hidden at rest without VoiceOver", async () => {
		const view = await mountAtRest("top");

		expect(view.button()).toBeNull();
	});

	it("offers the Refresh button at the top of the list while VoiceOver runs", async () => {
		voiceOver(true);
		const view = await mountAtRest("top");

		expect(view.button()).not.toBeNull();
		view.button()!.click();

		expect(view.onrefresh).toHaveBeenCalledOnce();
	});

	it("brings the Refresh button in when VoiceOver starts over a list at rest", async () => {
		const view = await mountAtRest("top");

		voiceOver(true);
		await view.wait(0);

		expect(view.button()).not.toBeNull();
	});

	it("takes the Refresh button away when VoiceOver stops", async () => {
		voiceOver(true);
		const view = await mountAtRest("top");

		voiceOver(false);
		await view.wait(0);
		await view.wait(TWEEN_MS);

		expect(view.button()).toBeNull();
	});
});
