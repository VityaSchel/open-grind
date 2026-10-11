import { afterEach, describe, expect, it, vi } from "vitest";

async function commandCenterShortcutOn(platform: string) {
	vi.resetModules();
	vi.stubGlobal("navigator", { platform });
	const { commandCenterKeybinding, parseShortcut } =
		await import("$lib/platform/keybindings");
	return parseShortcut(commandCenterKeybinding);
}

afterEach(() => {
	vi.unstubAllGlobals();
	vi.resetModules();
});

describe("parseShortcut", () => {
	it("reads the meta key tinykeys binds $mod to on Apple platforms", async () => {
		for (const platform of ["MacIntel", "iPhone", "iPad"]) {
			expect(await commandCenterShortcutOn(platform)).toEqual({
				modifier: "meta",
				key: "K",
			});
		}
	});

	it("reads the control key where tinykeys falls back to Control", async () => {
		for (const platform of ["Win32", "Linux x86_64", ""]) {
			expect(await commandCenterShortcutOn(platform)).toEqual({
				modifier: "control",
				key: "K",
			});
		}
	});
});
