// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { installVoiceOverWatch } from "#lib/platform/voice-over.svelte.ts";
import { resetPlatform, runningOn } from "#lib/test/platform.ts";
import {
	MIN_REFRESHING_MS,
	mountAtRest,
	TWEEN_MS,
	useRefreshControlHarness,
} from "./refresh-control-test-harness";
import { REFRESHED_HELD_MS } from "./refresh/refresh-announcer.svelte";

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

	it("keeps VoiceOver on the same Refresh button, hidden under the spinner and busy, through a refresh it starts", async () => {
		voiceOver(true);
		const view = await mountAtRest("top");
		const button = view.button()!;
		expect(view.status()!.textContent).toBe("");

		button.click();
		await view.setUpdating(true);

		expect(view.ticks()!.hasAttribute("data-spinning")).toBe(true);
		expect(view.button()).toBe(button);
		expect(button.parentElement!.style.opacity).toBe("0");
		expect(button.getAttribute("aria-busy")).toBe("true");
		expect(button.getAttribute("aria-disabled")).toBe("true");
		expect(view.status()!.textContent).toBe("Refreshing");

		await view.wait(MIN_REFRESHING_MS);
		await view.setUpdating(false);

		expect(view.phase()).toBe("idle");
		expect(view.button()).toBe(button);
		expect(button.parentElement!.style.opacity).toBe("");
		expect(button.hasAttribute("aria-busy")).toBe(false);
		expect(button.hasAttribute("aria-disabled")).toBe(false);
		expect(view.status()!.textContent).toBe("Refreshed");
	});

	it("keeps the Refresh button and says so when a refresh starts and ends on its own while VoiceOver runs", async () => {
		voiceOver(true);
		const view = await mountAtRest("top");
		const button = view.button()!;

		await view.setUpdating(true);
		expect(view.button()).toBe(button);
		expect(button.getAttribute("aria-busy")).toBe("true");
		expect(view.status()!.textContent).toBe("Refreshing");

		await view.setUpdating(false);
		expect(view.button()).toBe(button);
		expect(button.hasAttribute("aria-busy")).toBe(false);
		expect(view.status()!.textContent).toBe("Refreshed");

		await view.setUpdating(true);
		expect(view.status()!.textContent).toBe("Refreshing");
	});

	it("stays quiet about a refresh already running when the list appears, and speaks about the next one", async () => {
		voiceOver(true);
		const view = await mountAtRest("top", { updating: true });
		expect(view.status()!.textContent).toBe("");

		await view.setUpdating(false);
		expect(view.status()!.textContent).toBe("");

		await view.setUpdating(true);
		expect(view.status()!.textContent).toBe("Refreshing");
		await view.setUpdating(false);
		expect(view.status()!.textContent).toBe("Refreshed");
	});

	it("starts no second refresh when the busy Refresh button is pressed again", async () => {
		voiceOver(true);
		const view = await mountAtRest("top");

		view.button()!.click();
		await view.setUpdating(true);
		view.button()!.click();
		await view.wait(0);

		expect(view.onrefresh).toHaveBeenCalledOnce();
	});

	it("says nothing once a refresh it starts fails, leaving the failure to its toast", async () => {
		voiceOver(true);
		const view = await mountAtRest("top");

		view.button()!.click();
		await view.setUpdating(true);
		expect(view.status()!.textContent).toBe("Refreshing");

		await view.wait(MIN_REFRESHING_MS);
		await view.setUpdating(false, { failed: true });
		expect(view.phase()).toBe("idle");
		expect(view.status()!.textContent).toBe("");
	});

	it("never says Refreshed for a press its list never ran a refresh for", async () => {
		voiceOver(true);
		const view = await mountAtRest("top");

		view.button()!.click();
		await view.wait(0);
		expect(view.phase()).toBe("refreshing");
		expect(view.status()!.textContent).toBe("Refreshing");

		await new Promise((resolve) =>
			setTimeout(resolve, MIN_REFRESHING_MS + 50),
		);
		await view.wait(0);

		expect(view.onrefresh).toHaveBeenCalledOnce();
		expect(view.phase()).toBe("idle");
		expect(view.status()!.textContent).toBe("");
	});

	it("stays silent about the refreshes of a list under an open modal", async () => {
		voiceOver(true);
		const view = await mountAtRest("top");
		const dialog = document.body.appendChild(document.createElement("div"));
		dialog.setAttribute("role", "dialog");
		dialog.setAttribute("aria-modal", "true");

		await view.setUpdating(true);
		expect(view.status()!.textContent).toBe("");
		await view.setUpdating(false);
		expect(view.status()!.textContent).toBe("");
	});

	it("says nothing once a refresh that started on its own fails, and speaks again for the next one", async () => {
		voiceOver(true);
		const view = await mountAtRest("top");

		await view.setUpdating(true);
		await view.setUpdating(false, { failed: true });
		expect(view.status()!.textContent).toBe("");

		await view.setUpdating(true);
		await view.setUpdating(false);
		expect(view.status()!.textContent).toBe("Refreshed");
	});

	it("stays silent about the refreshes of a list off screen, and speaks once it is back", async () => {
		voiceOver(true);
		const view = await mountAtRest("top", { onScreen: false });

		await view.setUpdating(true);
		expect(view.status()!.textContent).toBe("");
		await view.setUpdating(false);
		expect(view.status()!.textContent).toBe("");

		await view.showList(true);
		await view.setUpdating(true);
		expect(view.status()!.textContent).toBe("Refreshing");
	});

	it("takes Refreshing back when the refresh ends after its list left the screen", async () => {
		voiceOver(true);
		const view = await mountAtRest("top");
		await view.setUpdating(true);

		await view.showList(false);
		await view.setUpdating(false);

		expect(view.status()!.textContent).toBe("");
	});

	it.each(["inert", "aria-hidden"] as const)(
		"stays silent about the refreshes of a list under an %s cover",
		async (attribute) => {
			voiceOver(true);
			const view = await mountAtRest("top");
			await view.coverList(attribute);

			await view.setUpdating(true);
			expect(view.status()!.textContent).toBe("");
			await view.setUpdating(false);
			expect(view.status()!.textContent).toBe("");
		},
	);

	it("keeps speaking for a list scrolled away from its edge", async () => {
		voiceOver(true);
		const view = await mountAtRest("top");
		await view.scrollIntoContent(300);

		await view.setUpdating(true);

		expect(view.status()!.textContent).toBe("Refreshing");
	});

	it("drops the pending clear of Refreshed when the list goes away", async () => {
		const timers = vi.spyOn(globalThis, "setTimeout");
		const clears = vi.spyOn(globalThis, "clearTimeout");
		voiceOver(true);
		const view = await mountAtRest("top");
		await view.setUpdating(true);
		await view.setUpdating(false);
		const scheduled = timers.mock.calls.findIndex(
			([, ms]) => ms === REFRESHED_HELD_MS,
		);
		const clearing: unknown = timers.mock.results[scheduled]!.value;

		view.unmount();

		expect(clears).toHaveBeenCalledWith(clearing);
	});

	it("speaks about a refresh without VoiceOver too, with no Refresh button to keep", async () => {
		const view = await mountAtRest("top");

		await view.setUpdating(true);
		expect(view.button()).toBeNull();
		expect(view.status()!.textContent).toBe("Refreshing");

		await view.setUpdating(false);
		expect(view.button()).toBeNull();
		expect(view.status()!.textContent).toBe("Refreshed");
	});

	it("keeps keyboard focus on a Refresh button a key brought, hidden under the spinner and busy, through a refresh it starts without VoiceOver", async () => {
		const view = await mountAtRest("top");
		await view.pressInsideList("ArrowUp");
		await view.wait(TWEEN_MS);
		const button = view.button()!;
		button.focus();
		expect(view.status()!.textContent).toBe("");

		button.click();
		await view.setUpdating(true);

		expect(view.ticks()!.hasAttribute("data-spinning")).toBe(true);
		expect(view.button()).toBe(button);
		expect(document.activeElement).toBe(button);
		expect(button.parentElement!.style.opacity).toBe("0");
		expect(button.style.pointerEvents).toBe("none");
		expect(button.getAttribute("tabindex")).toBe("-1");
		expect(button.getAttribute("aria-busy")).toBe("true");
		expect(button.getAttribute("aria-disabled")).toBe("true");
		expect(view.status()!.textContent).toBe("Refreshing");

		await view.wait(MIN_REFRESHING_MS);
		await view.setUpdating(false);

		expect(view.button()).toBe(button);
		expect(document.activeElement).toBe(button);
		expect(button.parentElement!.style.opacity).toBe("");
		expect(button.hasAttribute("tabindex")).toBe(false);
		expect(button.hasAttribute("aria-busy")).toBe(false);
		expect(view.status()!.textContent).toBe("Refreshed");
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
