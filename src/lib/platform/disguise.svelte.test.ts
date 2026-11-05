import { beforeEach, describe, expect, it, vi } from "vitest";

const tauri = vi.hoisted(() => ({ invoke: vi.fn(), isTauri: vi.fn() }));
const goto = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => tauri);
vi.mock("$app/navigation", () => ({ goto }));

const presets = [
	{ id: "hook-app", name: "Hook App" },
	{ id: "papizza", name: "papizza" },
];

function backendReports(current: string) {
	tauri.invoke.mockImplementation((command: string) =>
		command === "disguise_state"
			? Promise.resolve({
					available: true,
					current,
					presets,
					renameNeedsAdmin: false,
				})
			: Promise.resolve(),
	);
}

describe("the disguise state", () => {
	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();
		tauri.isTauri.mockReturnValue(true);
	});

	it("offers nothing until it has been hydrated", async () => {
		backendReports("original");
		const { disguiseAvailable, disguisePresets } =
			await import("./disguise.svelte");

		expect(disguiseAvailable()).toBe(false);
		expect(disguisePresets()).toEqual([]);
	});

	it("reports the presets and the current choice once hydrated", async () => {
		backendReports("hook-app");
		const {
			hydrateDisguiseState,
			disguiseAvailable,
			currentDisguise,
			disguisePresets,
		} = await import("./disguise.svelte");

		await hydrateDisguiseState();

		expect(tauri.invoke).toHaveBeenCalledWith("disguise_state");
		expect(disguiseAvailable()).toBe(true);
		expect(currentDisguise()).toBe("hook-app");
		expect(disguisePresets()).toEqual(presets);
	});

	it("says when only an administrator could rename the app", async () => {
		tauri.invoke.mockResolvedValue({
			available: true,
			current: "original",
			presets,
			renameNeedsAdmin: true,
		});
		const { hydrateDisguiseState, disguiseRenameNeedsAdmin } =
			await import("./disguise.svelte");

		expect(disguiseRenameNeedsAdmin()).toBe(false);
		await hydrateDisguiseState();

		expect(disguiseRenameNeedsAdmin()).toBe(true);
	});

	it("never rejects, so a failed probe cannot block the layout load", async () => {
		tauri.invoke.mockRejectedValue(new Error("no plugin"));
		const { hydrateDisguiseState, disguiseAvailable, currentDisguise } =
			await import("./disguise.svelte");

		await expect(hydrateDisguiseState()).resolves.toBeUndefined();
		expect(disguiseAvailable()).toBe(false);
		expect(currentDisguise()).toBe("original");
	});

	it("treats a malformed answer as unavailable", async () => {
		for (const answer of [null, "yes", { available: true }]) {
			vi.resetModules();
			tauri.invoke.mockResolvedValue(answer);
			const { hydrateDisguiseState, disguiseAvailable } =
				await import("./disguise.svelte");

			await hydrateDisguiseState();

			expect(disguiseAvailable()).toBe(false);
		}
	});

	it("probes once, not on every navigation", async () => {
		backendReports("original");
		const { hydrateDisguiseState } = await import("./disguise.svelte");

		await hydrateDisguiseState();
		await hydrateDisguiseState();

		expect(tauri.invoke).toHaveBeenCalledTimes(1);
	});

	it("does not reach for the backend outside Tauri", async () => {
		tauri.isTauri.mockReturnValue(false);
		const { hydrateDisguiseState, disguiseAvailable } =
			await import("./disguise.svelte");

		await hydrateDisguiseState();

		expect(tauri.invoke).not.toHaveBeenCalled();
		expect(disguiseAvailable()).toBe(false);
	});

	it("selects a disguise and re-reads, so the picker shows what applied", async () => {
		backendReports("original");
		const { selectDisguise, currentDisguise } =
			await import("./disguise.svelte");
		backendReports("papizza");

		await selectDisguise("papizza", {
			resume: "/settings/app/discreet-icon",
		});

		expect(tauri.invoke).toHaveBeenCalledWith("disguise_select", {
			id: "papizza",
			resume: "/settings/app/discreet-icon",
		});
		expect(currentDisguise()).toBe("papizza");
	});

	it("surfaces a failure to the caller", async () => {
		tauri.invoke.mockRejectedValue(
			"The icon changed, but renaming the app needs an administrator",
		);
		const { selectDisguise } = await import("./disguise.svelte");

		await expect(selectDisguise("papizza", { resume: null })).rejects.toBe(
			"The icon changed, but renaming the app needs an administrator",
		);
	});
});

describe("reopening after a disguise restart", () => {
	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();
		tauri.isTauri.mockReturnValue(true);
	});

	function backendResumes(path: unknown) {
		tauri.invoke.mockImplementation((command: string) =>
			command === "disguise_take_resume"
				? Promise.resolve(path)
				: Promise.resolve(),
		);
	}

	it("walks back down to the screen the restart left, so Back retraces it", async () => {
		backendResumes("/settings/app/discreet-icon");
		const { reopenAfterDisguiseRestart } =
			await import("./disguise.svelte");

		await reopenAfterDisguiseRestart();

		expect(goto.mock.calls.map(([path]) => path)).toEqual([
			"/settings",
			"/settings/app",
			"/settings/app/discreet-icon",
		]);
	});

	it("stays put after a plain start", async () => {
		backendResumes(null);
		const { reopenAfterDisguiseRestart } =
			await import("./disguise.svelte");

		await reopenAfterDisguiseRestart();

		expect(goto).not.toHaveBeenCalled();
	});

	it("only reopens settings screens", async () => {
		for (const path of [
			"/",
			"/chat/123",
			"https://example.com/settings/",
			42,
		]) {
			vi.clearAllMocks();
			backendResumes(path);
			const { reopenAfterDisguiseRestart } =
				await import("./disguise.svelte");

			await reopenAfterDisguiseRestart();

			expect(goto).not.toHaveBeenCalled();
		}
	});

	it("does not reach for the backend outside Tauri", async () => {
		tauri.isTauri.mockReturnValue(false);
		const { reopenAfterDisguiseRestart } =
			await import("./disguise.svelte");

		await reopenAfterDisguiseRestart();

		expect(tauri.invoke).not.toHaveBeenCalled();
		expect(goto).not.toHaveBeenCalled();
	});
});
