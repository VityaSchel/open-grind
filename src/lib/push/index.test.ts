import { beforeEach, describe, expect, it, vi } from "vitest";

import type { currentPlatform as CurrentPlatform } from "#lib/platform/os.ts";

const invoke = vi.hoisted(() =>
	vi.fn<(command: string, args?: unknown) => Promise<unknown>>(),
);
const os = vi.hoisted(() => ({
	currentPlatform: vi.fn<typeof CurrentPlatform>(() => "android"),
	isAndroidPlatform: vi.fn(() => true),
	isDesktopPlatform: vi.fn(() => false),
}));

vi.mock("@tauri-apps/api/core", () => ({ Channel: class {}, invoke }));
vi.mock("#lib/platform/os.ts", () => os);
vi.mock("#lib/updates/index.ts", () => ({
	getInstalledVersion: vi.fn(() => Promise.resolve(null)),
}));

async function freshModule() {
	vi.resetModules();
	return await import("./index");
}

beforeEach(() => {
	vi.clearAllMocks();
	invoke.mockResolvedValue(null);
	os.currentPlatform.mockReturnValue("android");
});

describe("the Fast Mode source commands", () => {
	it.each(["addon", "relay"] as const)(
		"reads %s as the configured source",
		async (source) => {
			invoke.mockResolvedValue(source);
			const module = await freshModule();

			expect(await module.currentFastSource()).toBe(source);
			expect(invoke).toHaveBeenCalledWith("push_fast_source");
		},
	);

	it("reads a missing answer as no source", async () => {
		const module = await freshModule();

		expect(await module.currentFastSource()).toBeNull();
	});

	it("refuses a source it does not know", async () => {
		invoke.mockResolvedValue("hosted");
		const module = await freshModule();

		await expect(module.currentFastSource()).rejects.toThrow();
	});

	it("records the chosen source by name", async () => {
		const module = await freshModule();

		await module.setFastSource("relay");

		expect(invoke).toHaveBeenCalledWith("push_set_fast_source", {
			source: "relay",
		});
	});

	it("reads a missing Google Play services answer as absent", async () => {
		const module = await freshModule();

		expect(await module.playServicesAvailable()).toBe(false);
		invoke.mockResolvedValue(true);
		expect(await module.playServicesAvailable()).toBe(true);
	});
});

describe("the fcm-relay commands", () => {
	it("calls each command by its native name", async () => {
		const module = await freshModule();

		await module.beginRelaySetup();
		await module.shareRelayConfig();
		await module.awaitRelay();
		await module.registerRelay();
		await module.unregisterRelay();
		await module.cancelRelaySetup();
		await module.forgetRelay();
		await module.dropRelayOrphans();

		expect(invoke.mock.calls.map(([command]) => command)).toEqual([
			"push_relay_begin",
			"push_relay_share_config",
			"push_relay_await",
			"push_relay_register",
			"push_relay_unregister",
			"push_relay_cancel",
			"push_relay_forget",
			"push_relay_drop_orphans",
		]);
	});

	it("reports whether the config was saved", async () => {
		const module = await freshModule();

		expect(await module.saveRelayConfig()).toBe(false);
		invoke.mockResolvedValue(true);
		expect(await module.saveRelayConfig()).toBe(true);
		expect(invoke).toHaveBeenCalledWith("push_relay_save_config");
	});

	it("sends only the code to commit the pairing", async () => {
		invoke.mockResolvedValue({ matched: true });
		const module = await freshModule();

		expect(await module.commitRelay("658591")).toEqual({ matched: true });
		expect(invoke).toHaveBeenCalledWith("push_relay_commit", {
			code: "658591",
		});
	});

	it("reads the pairing status, and a missing one as unpaired", async () => {
		const module = await freshModule();

		expect(await module.relayStatus()).toEqual({
			paired: false,
			broken: false,
		});
		invoke.mockResolvedValue({ paired: true, broken: true });
		expect(await module.relayStatus()).toEqual({
			paired: true,
			broken: true,
		});
		expect(invoke).toHaveBeenCalledWith("push_relay_status");
	});
});

describe("the Fast Mode sources each platform offers", () => {
	it("offers the add-on and fcm-relay on Android", async () => {
		const module = await freshModule();

		expect(module.fastModeOptions()).toEqual(["addon", "relay"]);
	});

	it.each([
		"ios",
		"linux",
		"macos",
		"windows",
		"freebsd",
		"dragonfly",
		"netbsd",
		"openbsd",
		"solaris",
		"web",
	] as const)("offers none on %s for now", async (platform) => {
		os.currentPlatform.mockReturnValue(platform);
		const module = await freshModule();

		expect(module.fastModeOptions()).toEqual([]);
	});
});
