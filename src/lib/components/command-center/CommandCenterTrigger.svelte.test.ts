// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Shortcut } from "$lib/platform/keybindings";

const { isMobilePlatform, parseShortcut } = vi.hoisted(() => ({
	isMobilePlatform: vi.fn(() => false),
	parseShortcut: vi.fn<(keybinding: string) => Shortcut>(),
}));

vi.mock("$lib/platform/os", () => ({ isMobilePlatform }));
vi.mock("$lib/platform/keybindings", async (importOriginal) => ({
	...(await importOriginal<typeof import("$lib/platform/keybindings")>()),
	parseShortcut,
}));

import { setLocale, SOURCE_LOCALE } from "$lib/i18n";
import { PSEUDO_MESSAGE } from "$lib/i18n/fixtures/pseudo-message";
import { commandCenterKeybinding } from "$lib/platform/keybindings";
import CommandCenterTrigger from "./CommandCenterTrigger.svelte";

function renderTriggerWith(modifier: Shortcut["modifier"]) {
	parseShortcut.mockReturnValue({ modifier, key: "K" });
	render(CommandCenterTrigger);
	return screen.getByRole("button", { name: "Command Center" });
}

afterEach(async () => {
	cleanup();
	parseShortcut.mockReset();
	isMobilePlatform.mockReturnValue(false);
	await setLocale({ locale: SOURCE_LOCALE });
});

describe("CommandCenterTrigger", () => {
	it("shows the Command key for a Meta shortcut", () => {
		const trigger = renderTriggerWith("meta");

		expect(parseShortcut).toHaveBeenCalledExactlyOnceWith(
			commandCenterKeybinding,
		);
		expect(trigger.textContent.trim()).toBe("⌘ + K");
	});

	it("names the Control key for a Control shortcut", () => {
		const trigger = renderTriggerWith("control");

		expect(trigger.textContent.trim()).toBe("Ctrl + K");
	});

	it("leaves the Control key open to translation and keeps the key verbatim", () => {
		const trigger = renderTriggerWith("control");

		const controlKey = within(trigger).getByText("Ctrl");
		expect(controlKey.closest('[translate="no"]')).toBeNull();
		expect(within(trigger).getByText("+ K").getAttribute("translate")).toBe(
			"no",
		);
	});

	it("leaves the shortcut out on mobile platforms", () => {
		isMobilePlatform.mockReturnValue(true);

		const trigger = renderTriggerWith("meta");

		expect(trigger.querySelector("kbd")).toBeNull();
	});

	it("words its name and the Control key in the active locale", async () => {
		const trigger = renderTriggerWith("control");

		await setLocale({ locale: "en-XA" });

		expect(trigger.getAttribute("aria-label")).toMatch(PSEUDO_MESSAGE);
		expect(trigger.textContent.trim()).toMatch(/^⟦.+⟧ \+ K$/);
	});
});
