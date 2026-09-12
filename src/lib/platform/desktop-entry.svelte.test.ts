import { beforeEach, describe, expect, it, vi } from "vitest";

const tauri = vi.hoisted(() => ({ invoke: vi.fn(), isTauri: vi.fn() }));

vi.mock("@tauri-apps/api/core", () => tauri);

type State = { available: boolean; installed: boolean };

function backendReports(reported: State) {
	tauri.invoke.mockImplementation((command: string) =>
		command === "desktop_entry_state"
			? Promise.resolve(reported)
			: Promise.resolve(),
	);
}

describe("the desktop entry state", () => {
	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();
		tauri.isTauri.mockReturnValue(true);
	});

	it("offers nothing until it has been hydrated", async () => {
		backendReports({ available: true, installed: false });
		const { desktopEntryAvailable } =
			await import("./desktop-entry.svelte");

		expect(desktopEntryAvailable()).toBe(false);
	});

	it("reports what the backend says once hydrated", async () => {
		backendReports({ available: true, installed: true });
		const {
			hydrateDesktopEntryState,
			desktopEntryAvailable,
			desktopEntryInstalled,
		} = await import("./desktop-entry.svelte");

		await hydrateDesktopEntryState();

		expect(tauri.invoke).toHaveBeenCalledWith("desktop_entry_state");
		expect(desktopEntryAvailable()).toBe(true);
		expect(desktopEntryInstalled()).toBe(true);
	});

	it("never rejects, so a failed probe cannot block the layout load", async () => {
		tauri.invoke.mockRejectedValue(new Error("no data home"));
		const { hydrateDesktopEntryState, desktopEntryAvailable } =
			await import("./desktop-entry.svelte");

		await expect(hydrateDesktopEntryState()).resolves.toBeUndefined();
		expect(desktopEntryAvailable()).toBe(false);
	});

	it("survives a platform that answers nothing, so the settings page still renders", async () => {
		for (const answer of [null, undefined, "yes", 0]) {
			vi.resetModules();
			tauri.invoke.mockResolvedValue(answer);
			const { hydrateDesktopEntryState, desktopEntryAvailable } =
				await import("./desktop-entry.svelte");

			await hydrateDesktopEntryState();

			expect(desktopEntryAvailable()).toBe(false);
		}
	});

	it("treats a half-filled answer as a missing capability", async () => {
		tauri.invoke.mockResolvedValue({ installed: true });
		const {
			hydrateDesktopEntryState,
			desktopEntryAvailable,
			desktopEntryInstalled,
		} = await import("./desktop-entry.svelte");

		await hydrateDesktopEntryState();

		expect(desktopEntryAvailable()).toBe(false);
		expect(desktopEntryInstalled()).toBe(true);
	});

	it("probes once, not on every navigation", async () => {
		backendReports({ available: true, installed: false });
		const { hydrateDesktopEntryState } =
			await import("./desktop-entry.svelte");

		await hydrateDesktopEntryState();
		await hydrateDesktopEntryState();

		expect(tauri.invoke).toHaveBeenCalledTimes(1);
	});

	it("does not reach for the backend outside Tauri", async () => {
		tauri.isTauri.mockReturnValue(false);
		const { hydrateDesktopEntryState, desktopEntryAvailable } =
			await import("./desktop-entry.svelte");

		await hydrateDesktopEntryState();

		expect(tauri.invoke).not.toHaveBeenCalled();
		expect(desktopEntryAvailable()).toBe(false);
	});

	it("installs and re-reads, so the toggle shows what is on disk", async () => {
		backendReports({ available: true, installed: false });
		const { setDesktopEntryInstalled, desktopEntryInstalled } =
			await import("./desktop-entry.svelte");
		backendReports({ available: true, installed: true });

		await setDesktopEntryInstalled(true);

		expect(tauri.invoke).toHaveBeenCalledWith("desktop_entry_install");
		expect(desktopEntryInstalled()).toBe(true);
	});

	it("removes when switched off", async () => {
		backendReports({ available: true, installed: true });
		const { setDesktopEntryInstalled, desktopEntryInstalled } =
			await import("./desktop-entry.svelte");
		backendReports({ available: true, installed: false });

		await setDesktopEntryInstalled(false);

		expect(tauri.invoke).toHaveBeenCalledWith("desktop_entry_remove");
		expect(desktopEntryInstalled()).toBe(false);
	});

	it("surfaces a write failure to the caller", async () => {
		tauri.invoke.mockRejectedValue(new Error("read-only home"));
		const { setDesktopEntryInstalled } =
			await import("./desktop-entry.svelte");

		await expect(setDesktopEntryInstalled(true)).rejects.toThrow(
			"read-only home",
		);
	});
});
