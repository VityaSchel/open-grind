import { vi } from "vitest";

import type {
	NotificationPermission,
	PushErrorReason,
	PushToken,
} from "./types";

export const push = {
	addonReady: vi.fn<() => Promise<void>>(),
	currentMode: vi.fn<() => Promise<"slow" | "fast">>(),
	deletePushToken: vi.fn<() => Promise<void>>(),
	fcmServiceInstalled: vi.fn<() => Promise<boolean>>(),
	inFastMode: vi.fn<() => Promise<boolean>>(),
	mintPushToken: vi.fn<() => Promise<PushToken>>(),
	notificationPermission: vi.fn<() => Promise<NotificationPermission>>(),
	openNotificationSettings: vi.fn<() => Promise<void>>(),
	pushAvailableHere: vi.fn(() => true),
	pushErrorReason: vi.fn<() => PushErrorReason | null>(() => "failed"),
	requestNotificationPermission:
		vi.fn<() => Promise<NotificationPermission>>(),
	setMode: vi.fn<(mode: "slow" | "fast") => Promise<void>>(),
	setNotificationsEnabled: vi.fn<(enabled: boolean) => Promise<void>>(),
};

export const installNow = vi.fn<() => Promise<void>>();

const installListeners = new Set<() => Promise<void>>();

export const addon = {
	addonFlow: vi.fn(() => ({ installNow })),
	addonInstallerAvailable: vi.fn(() => true),
	onAddonInstalled: vi.fn(
		({ listener }: { listener: () => Promise<void> }) => {
			installListeners.add(listener);
		},
	),
};

export const account = {
	registerPushToken: vi.fn<(token: PushToken) => Promise<void>>(),
	unregisterPushToken: vi.fn<(token: string) => Promise<void>>(),
};

export const toasts = {
	showErrorToast: vi.fn<(toast: { label: string; error: unknown }) => void>(),
};

const stored = { notificationsEnabled: false };

export const preferences = {
	stored,
	getPreferences: vi.fn(() => Promise.resolve({ ...stored })),
	preferencesSnapshot: vi.fn(() => stored),
	setPreferences: vi.fn((next: { notificationsEnabled?: boolean }) => {
		Object.assign(stored, next);
		return Promise.resolve();
	}),
};

export const order: string[] = [];

export function recordOrder(): void {
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

export function nativeMode(mode: "slow" | "fast"): void {
	push.currentMode.mockResolvedValue(mode);
	push.inFastMode.mockResolvedValue(mode === "fast");
}

export function toastLabel(): string | undefined {
	return toasts.showErrorToast.mock.lastCall?.[0].label;
}

export function toastDetails(): unknown {
	return toasts.showErrorToast.mock.lastCall?.[0].error;
}

export async function addonInstalled(): Promise<void> {
	await Promise.all([...installListeners].map((listener) => listener()));
}

export const token: PushToken = {
	token: "fid:APA91b",
	vendorProvidedIdentifier: "fid",
};

export const granted: NotificationPermission = {
	granted: true,
	state: "granted",
};

export async function freshModule() {
	vi.resetModules();
	return {
		...(await import("./notification-state.svelte")),
		...(await import("./delivery.svelte")),
		...(await import("./notifications.svelte")),
	};
}

export async function switchedOn() {
	const module = await freshModule();
	await module.toggleNotifications(true);
	vi.clearAllMocks();
	order.length = 0;
	return module;
}

export async function inFast() {
	nativeMode("fast");
	const module = await freshModule();
	await module.reconcileNotifications();
	vi.clearAllMocks();
	order.length = 0;
	return module;
}

export function resetPushMocks(): void {
	vi.clearAllMocks();
	order.length = 0;
	installListeners.clear();
	stored.notificationsEnabled = true;
	nativeMode("slow");
	push.addonReady.mockResolvedValue(undefined);
	push.deletePushToken.mockResolvedValue(undefined);
	push.fcmServiceInstalled.mockResolvedValue(true);
	push.mintPushToken.mockResolvedValue(token);
	push.notificationPermission.mockResolvedValue(granted);
	push.openNotificationSettings.mockResolvedValue(undefined);
	push.pushErrorReason.mockReturnValue("failed");
	push.requestNotificationPermission.mockResolvedValue(granted);
	push.setMode.mockResolvedValue(undefined);
	push.setNotificationsEnabled.mockResolvedValue(undefined);
	addon.addonInstallerAvailable.mockReturnValue(true);
	installNow.mockResolvedValue(undefined);
	account.registerPushToken.mockResolvedValue(undefined);
	account.unregisterPushToken.mockResolvedValue(undefined);
}
