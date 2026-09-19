import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
	NotificationPermission,
	PushErrorReason,
	PushToken,
} from "./types";

const push = vi.hoisted(() => ({
	addonReady: vi.fn<() => Promise<void>>(),
	deletePushToken: vi.fn<() => Promise<void>>(),
	currentMode: vi.fn<() => Promise<"slow" | "fast">>(),
	mintPushToken: vi.fn<() => Promise<PushToken>>(),
	notificationPermission: vi.fn<() => Promise<NotificationPermission>>(),
	openNotificationSettings: vi.fn<() => Promise<void>>(),
	pushAvailableHere: vi.fn(() => true),
	pushErrorReason: vi.fn<() => PushErrorReason | null>(() => "failed"),
	requestNotificationPermission:
		vi.fn<() => Promise<NotificationPermission>>(),
	setMode: vi.fn<(mode: "slow" | "fast") => Promise<void>>(),
	setNotificationsEnabled: vi.fn<(enabled: boolean) => Promise<void>>(),
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
}));
const preferences = vi.hoisted(() => {
	const stored = { notificationsEnabled: false };
	return {
		stored,
		getPreferences: vi.fn(() => Promise.resolve({ ...stored })),
		preferencesSnapshot: vi.fn(() => stored),
		preferencesLoaded: vi.fn(() => true),
		setPreferences: vi.fn((next: { notificationsEnabled?: boolean }) => {
			Object.assign(stored, next);
			return Promise.resolve();
		}),
	};
});

vi.mock("./index", () => push);
vi.mock("$lib/updates", () => updates);
vi.mock("$lib/updates/addon.svelte", () => addon);
vi.mock("$lib/api/settings/account", () => account);
vi.mock("$lib/app-data/preferences.svelte", () => preferences);

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
	push.setNotificationsEnabled.mockImplementation((enabled) => {
		order.push(enabled ? "arm" : "disarm");
		return Promise.resolve();
	});
}

const token: PushToken = {
	token: "fid:APA91b",
	vendorProvidedIdentifier: "fid",
};

const granted: NotificationPermission = { granted: true, state: "granted" };

async function freshModule() {
	vi.resetModules();
	return await import("./notifications.svelte");
}

async function switchedOn() {
	const module = await freshModule();
	await module.toggleNotifications(true);
	vi.clearAllMocks();
	order.length = 0;
	return module;
}

beforeEach(() => {
	vi.clearAllMocks();
	order.length = 0;
	preferences.stored.notificationsEnabled = false;
	push.addonReady.mockResolvedValue(undefined);
	push.deletePushToken.mockResolvedValue(undefined);
	push.currentMode.mockResolvedValue("slow");
	push.mintPushToken.mockResolvedValue(token);
	push.notificationPermission.mockResolvedValue(granted);
	push.openNotificationSettings.mockResolvedValue(undefined);
	push.requestNotificationPermission.mockResolvedValue(granted);
	push.setMode.mockResolvedValue(undefined);
	push.setNotificationsEnabled.mockResolvedValue(undefined);
	updates.getInstalledVersion.mockResolvedValue("1.0.0");
	account.registerPushToken.mockResolvedValue(undefined);
	account.unregisterPushToken.mockResolvedValue(undefined);
});

describe("the notifications master switch", () => {
	it("asks Android for permission before it turns anything on", async () => {
		const module = await freshModule();

		await module.toggleNotifications(true);

		expect(push.requestNotificationPermission).toHaveBeenCalled();
		expect(push.setNotificationsEnabled).toHaveBeenCalledWith(true);
		expect(module.notificationSettings.enabled).toBe(true);
	});

	it("stays off when the user denies the permission", async () => {
		push.requestNotificationPermission.mockResolvedValue({
			granted: false,
			state: "prompt-with-rationale",
		});
		const module = await freshModule();

		await module.toggleNotifications(true);

		expect(push.setNotificationsEnabled).not.toHaveBeenCalled();
		expect(push.openNotificationSettings).not.toHaveBeenCalled();
		expect(module.notificationSettings.enabled).toBe(false);
	});

	it("sends a permanently blocked user to system settings instead of a dead switch", async () => {
		push.requestNotificationPermission.mockResolvedValue({
			granted: false,
			state: "denied",
		});
		const module = await freshModule();

		await module.toggleNotifications(true);

		expect(push.openNotificationSettings).toHaveBeenCalled();
		expect(module.notificationSettings.enabled).toBe(false);
	});

	it("registers the device again when notifications return in fast mode", async () => {
		push.currentMode.mockResolvedValue("fast");
		const module = await freshModule();
		await module.loadNotificationSettings();

		await module.toggleNotifications(true);

		expect(account.registerPushToken).toHaveBeenCalledWith(token);
	});

	it("leaves a slow-mode account alone rather than minting a token it cannot use", async () => {
		const module = await freshModule();

		await module.toggleNotifications(true);

		expect(push.mintPushToken).not.toHaveBeenCalled();
	});

	it("stops rendering before it asks Grindr to forget the token", async () => {
		push.currentMode.mockResolvedValue("fast");
		const module = await switchedOn();
		recordOrder();

		await module.toggleNotifications(false);

		expect(order).toEqual(["disarm", "unregister", "delete"]);
		expect(module.notificationSettings.enabled).toBe(false);
	});

	it("leaves the delivery mode alone when notifications are turned off", async () => {
		push.currentMode.mockResolvedValue("fast");
		const module = await switchedOn();

		await module.toggleNotifications(false);

		expect(push.setMode).not.toHaveBeenCalled();
	});

	it("turns the stored setting off when Android revoked the permission", async () => {
		const module = await switchedOn();
		push.notificationPermission.mockResolvedValue({
			granted: false,
			state: "denied",
		});

		await module.loadNotificationSettings();

		expect(module.notificationSettings.enabled).toBe(false);
		expect(push.setNotificationsEnabled).toHaveBeenCalledWith(false);
		expect(push.openNotificationSettings).not.toHaveBeenCalled();
	});

	it("does not turn notifications back on when the permission is granted again", async () => {
		const module = await freshModule();
		await module.loadNotificationSettings();

		expect(module.notificationSettings.enabled).toBe(false);
		expect(push.setNotificationsEnabled).toHaveBeenCalledWith(false);
	});
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
		order.length = 0;

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
