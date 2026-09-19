import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PushErrorReason, PushToken } from "./types";

const push = vi.hoisted(() => ({
	addonReady: vi.fn<() => Promise<void>>(),
	deletePushToken: vi.fn<() => Promise<void>>(),
	currentMode: vi.fn<() => Promise<"slow" | "fast">>(),
	mintPushToken: vi.fn<() => Promise<PushToken>>(),
	notificationsPermitted: vi.fn<() => Promise<boolean>>(),
	pushAvailableHere: vi.fn(() => true),
	pushErrorReason: vi.fn<() => PushErrorReason | null>(() => "failed"),
	requestNotifications: vi.fn<() => Promise<boolean>>(),
	setMode: vi.fn<(mode: "slow" | "fast") => Promise<void>>(),
	pushCategories: vi.fn<() => Promise<unknown[]>>(),
	setPushCategory:
		vi.fn<(category: string, enabled: boolean) => Promise<void>>(),
	openPushCategorySettings: vi.fn<(category: string) => Promise<void>>(),
}));
const updates = vi.hoisted(() => ({
	getInstalledVersion: vi.fn<() => Promise<string | null>>(),
}));
const addon = vi.hoisted(() => ({
	addonFlow: vi.fn(() => ({ installNow: vi.fn<() => Promise<void>>() })),
	addonInstallerAvailable: vi.fn(() => true),
}));
const account = vi.hoisted(() => ({
	registerPushToken: vi.fn<(token: PushToken) => Promise<void>>(),
	unregisterPushToken: vi.fn<(token: string) => Promise<void>>(),
	getPushSettings:
		vi.fn<() => Promise<{ tapPushNotification?: boolean | null }>>(),
	setPushSettings:
		vi.fn<(settings: { tapPushNotification?: boolean }) => Promise<void>>(),
}));

vi.mock("./index", () => push);
vi.mock("$lib/updates", () => updates);
vi.mock("$lib/updates/addon.svelte", () => addon);
vi.mock("$lib/api/settings/account", () => account);

const order: string[] = [];

function recordOrder(): void {
	account.registerPushToken.mockImplementation(() => {
		order.push("register");
		return Promise.resolve();
	});
	account.unregisterPushToken.mockImplementation(() => {
		order.push("unregister");
		return Promise.resolve();
	});
	push.setMode.mockImplementation((mode) => {
		order.push(mode === "fast" ? "enable" : "disable");
		return Promise.resolve();
	});
	push.deletePushToken.mockImplementation(() => {
		order.push("delete");
		return Promise.resolve();
	});
}

const token: PushToken = {
	token: "fid:APA91b",
	vendorProvidedIdentifier: "fid",
};

async function freshModule() {
	vi.resetModules();
	return await import("./notifications.svelte");
}

beforeEach(() => {
	vi.clearAllMocks();
	order.length = 0;
	push.addonReady.mockResolvedValue(undefined);
	push.deletePushToken.mockResolvedValue(undefined);
	push.currentMode.mockResolvedValue("slow");
	push.mintPushToken.mockResolvedValue(token);
	push.notificationsPermitted.mockResolvedValue(true);
	push.requestNotifications.mockResolvedValue(true);
	push.setMode.mockResolvedValue(undefined);
	updates.getInstalledVersion.mockResolvedValue("1.0.0");
	account.registerPushToken.mockResolvedValue(undefined);
	account.getPushSettings.mockResolvedValue({});
	account.setPushSettings.mockResolvedValue(undefined);
	push.pushCategories.mockResolvedValue([]);
	push.setPushCategory.mockResolvedValue(undefined);
	account.unregisterPushToken.mockResolvedValue(undefined);
});

describe("choosing a notification mode", () => {
	it("starts on the mode the add-on bridge remembers", async () => {
		push.currentMode.mockResolvedValue("fast");
		const module = await freshModule();

		await module.loadNotificationSettings();

		expect(module.notificationSettings.mode).toBe("fast");
	});

	it("registers the device with Grindr before it turns fast mode on", async () => {
		recordOrder();
		const module = await freshModule();

		await module.selectNotificationMode("fast");

		expect(account.registerPushToken).toHaveBeenCalledWith(token);
		expect(order).toEqual(["register", "enable"]);
		expect(module.notificationSettings.mode).toBe("fast");
	});

	it("stays slow when Grindr refuses the token", async () => {
		account.registerPushToken.mockRejectedValue(new Error("500"));
		const module = await freshModule();

		await module.selectNotificationMode("fast");

		expect(push.setMode).not.toHaveBeenCalled();
		expect(module.notificationSettings.mode).toBe("slow");
		expect(module.notificationSettings.problem).not.toBeNull();
	});

	it("stays slow when the add-on cannot mint a token", async () => {
		push.mintPushToken.mockRejectedValue(new Error("no firebase"));
		push.pushErrorReason.mockReturnValue("firebaseUnavailable");
		const module = await freshModule();

		await module.selectNotificationMode("fast");

		expect(account.registerPushToken).not.toHaveBeenCalled();
		expect(module.notificationSettings.mode).toBe("slow");
		expect(module.notificationSettings.problem).toContain("microG");
	});

	it("stays slow when Android blocks notifications", async () => {
		push.requestNotifications.mockResolvedValue(false);
		const module = await freshModule();

		await module.selectNotificationMode("fast");

		expect(push.mintPushToken).not.toHaveBeenCalled();
		expect(module.notificationSettings.mode).toBe("slow");
		expect(module.notificationSettings.problem).toContain("Android");
	});

	it("asks before downloading the add-on instead of installing it silently", async () => {
		updates.getInstalledVersion.mockResolvedValue(null);
		const module = await freshModule();

		await module.selectNotificationMode("fast");

		expect(module.notificationSettings.addonRequested).toBe(true);
		expect(addon.addonFlow).not.toHaveBeenCalled();
		expect(module.notificationSettings.mode).toBe("slow");
	});

	it("only enables fast mode once the add-on it installed has arrived", async () => {
		updates.getInstalledVersion.mockResolvedValue(null);
		const module = await freshModule();
		await module.selectNotificationMode("fast");

		await module.installPushAddon();

		expect(module.notificationSettings.addonRequested).toBe(false);
		expect(push.setMode).not.toHaveBeenCalled();

		await module.pushAddonInstalled();

		expect(module.notificationSettings.mode).toBe("fast");
	});

	it("ignores an add-on install nobody asked for", async () => {
		const module = await freshModule();

		await module.pushAddonInstalled();

		expect(push.setMode).not.toHaveBeenCalled();
		expect(module.notificationSettings.mode).toBe("slow");
	});

	it("unregisters the device when the user goes back to slow", async () => {
		recordOrder();
		push.currentMode.mockResolvedValue("fast");
		const module = await freshModule();
		await module.loadNotificationSettings();

		await module.selectNotificationMode("slow");

		expect(account.unregisterPushToken).toHaveBeenCalledWith(token.token);
		expect(order).toEqual(["unregister", "disable", "delete"]);
		expect(module.notificationSettings.mode).toBe("slow");
	});

	it("still forgets the mode when the add-on cannot delete its token", async () => {
		push.currentMode.mockResolvedValue("fast");
		push.deletePushToken.mockRejectedValue(new Error("gone"));
		const module = await freshModule();
		await module.loadNotificationSettings();

		await module.selectNotificationMode("slow");

		expect(module.notificationSettings.mode).toBe("slow");
	});

	it("tells Grindr to forget the token before it stops rendering pushes", async () => {
		recordOrder();
		push.currentMode.mockResolvedValue("fast");
		const module = await freshModule();
		await module.loadNotificationSettings();

		await module.selectNotificationMode("slow");

		expect(order.indexOf("unregister")).toBeLessThan(
			order.indexOf("delete"),
		);
	});

	it("leaves Grindr alone when push was never registered", async () => {
		const module = await freshModule();

		await module.selectNotificationMode("fast");
		account.unregisterPushToken.mockClear();
		push.currentMode.mockResolvedValue("slow");
		await module.selectNotificationMode("slow");

		expect(account.unregisterPushToken).not.toHaveBeenCalled();
	});

	it("reports a failure to arm battery-friendly delivery instead of hiding it", async () => {
		const module = await freshModule();

		await module.selectNotificationMode("fast");
		push.setMode.mockRejectedValueOnce(
			new Error("no ACCESS_NETWORK_STATE"),
		);
		await module.selectNotificationMode("slow");

		expect(module.notificationSettings.problem).not.toBeNull();
	});

	it("does nothing when the chosen mode is already the current one", async () => {
		const module = await freshModule();

		await module.selectNotificationMode("slow");

		expect(push.setMode).not.toHaveBeenCalled();
	});

	it("reports that a build cannot install the add-on itself", async () => {
		addon.addonInstallerAvailable.mockReturnValue(false);
		const module = await freshModule();

		expect(module.addonInstallableHere()).toBe(false);
	});

	it("asks a build that cannot install add-ons to install it by hand, not through a dead prompt", async () => {
		addon.addonInstallerAvailable.mockReturnValue(false);
		updates.getInstalledVersion.mockResolvedValue(null);
		const module = await freshModule();

		await module.selectNotificationMode("fast");

		expect(module.notificationSettings.addonRequested).toBe(false);
		expect(module.notificationSettings.manualInstall).toBe(true);
		expect(module.notificationSettings.problem).toBeNull();
		expect(module.notificationSettings.mode).toBe("slow");
	});
});

describe("notification categories", () => {
	const categories = [
		{ category: "messages", enabled: true, systemBlocked: false },
		{ category: "taps", enabled: true, systemBlocked: false },
	];

	it("adopts the account's tap setting so the background poll obeys it too", async () => {
		push.pushCategories.mockResolvedValue(
			categories.map((entry) => ({ ...entry })),
		);
		account.getPushSettings.mockResolvedValue({
			tapPushNotification: false,
		});
		const module = await freshModule();

		await module.loadNotificationCategories();

		expect(push.setPushCategory).toHaveBeenCalledWith("taps", false);
		expect(
			module.notificationCategories.list.find(
				(entry) => entry.category === "taps",
			)?.enabled,
		).toBe(false);
	});

	it("leaves the device alone when the account has no opinion on taps", async () => {
		push.pushCategories.mockResolvedValue(
			categories.map((entry) => ({ ...entry })),
		);
		account.getPushSettings.mockResolvedValue({
			tapPushNotification: null,
		});
		const module = await freshModule();

		await module.loadNotificationCategories();

		expect(push.setPushCategory).not.toHaveBeenCalled();
	});

	it("writes a tap change back to the account, since taps are shared", async () => {
		push.pushCategories.mockResolvedValue(
			categories.map((entry) => ({ ...entry })),
		);
		const module = await freshModule();

		await module.toggleNotificationCategory("taps", false);

		expect(push.setPushCategory).toHaveBeenCalledWith("taps", false);
		expect(account.setPushSettings).toHaveBeenCalledWith({
			tapPushNotification: false,
		});
	});

	it("keeps messages off the account, which has no message setting", async () => {
		push.pushCategories.mockResolvedValue(
			categories.map((entry) => ({ ...entry })),
		);
		const module = await freshModule();

		await module.toggleNotificationCategory("messages", false);

		expect(account.setPushSettings).not.toHaveBeenCalled();
	});
});
