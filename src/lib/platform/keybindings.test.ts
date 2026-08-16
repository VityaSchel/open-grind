import { afterEach, describe, expect, it, vi } from "vitest";

async function labelOn(platform: string) {
	vi.resetModules();
	vi.stubGlobal("navigator", { platform });
	const { modifierKeyLabel } = await import("$lib/platform/keybindings");
	return modifierKeyLabel();
}

afterEach(() => {
	vi.unstubAllGlobals();
	vi.resetModules();
});

describe("modifierKeyLabel", () => {
	it("names the key tinykeys binds $mod to on Apple platforms", async () => {
		for (const platform of ["MacIntel", "iPhone", "iPad"]) {
			expect(await labelOn(platform)).toBe("⌘");
		}
	});

	it("names Ctrl where tinykeys falls back to Control", async () => {
		for (const platform of ["Win32", "Linux x86_64", ""]) {
			expect(await labelOn(platform)).toBe("Ctrl");
		}
	});
});
