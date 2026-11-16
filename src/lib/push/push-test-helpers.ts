import { expect, vi } from "vitest";

import type {
	FastSource,
	NotificationPermission,
	PushErrorReason,
	PushToken,
	RelayCommit,
	RelayStatus,
} from "./types";

export const push = {
	addonReady: vi.fn<() => Promise<void>>(),
	awaitRelay: vi.fn<() => Promise<void>>(),
	beginRelaySetup: vi.fn<() => Promise<void>>(),
	cancelRelaySetup: vi.fn<() => Promise<void>>(),
	commitRelay: vi.fn<(code: string) => Promise<RelayCommit>>(),
	currentFastSource: vi.fn<() => Promise<FastSource | null>>(),
	currentMode: vi.fn<() => Promise<"slow" | "fast">>(),
	deletePushToken: vi.fn<() => Promise<void>>(),
	fastModeOptions: vi.fn<() => FastSource[]>(() => ["addon", "relay"]),
	fcmServiceInstalled: vi.fn<() => Promise<boolean>>(),
	forgetRelay: vi.fn<() => Promise<void>>(),
	inFastMode: vi.fn<() => Promise<boolean>>(),
	mintPushToken: vi.fn<() => Promise<PushToken>>(),
	notificationPermission: vi.fn<() => Promise<NotificationPermission>>(),
	openNotificationSettings: vi.fn<() => Promise<void>>(),
	playServicesAvailable: vi.fn<() => Promise<boolean>>(),
	pushAvailableHere: vi.fn(() => true),
	pushErrorReason: vi.fn<(error?: unknown) => PushErrorReason | null>(
		() => "failed",
	),
	registerRelay: vi.fn<() => Promise<void>>(),
	relayStatus: vi.fn<() => Promise<RelayStatus>>(),
	requestNotificationPermission:
		vi.fn<() => Promise<NotificationPermission>>(),
	saveRelayConfig: vi.fn<() => Promise<boolean>>(),
	setFastSource: vi.fn<(source: FastSource) => Promise<void>>(),
	setMode: vi.fn<(mode: "slow" | "fast") => Promise<void>>(),
	setNotificationsEnabled: vi.fn<(enabled: boolean) => Promise<void>>(),
	shareRelayConfig: vi.fn<() => Promise<void>>(),
	unregisterRelay: vi.fn<() => Promise<void>>(),
};

export const installNow = vi.fn<() => Promise<void>>();

const installListeners = new Set<() => Promise<void>>();

export const addon = {
	addonFlow: vi.fn(() => ({ installNow })),
	addonInstallerAvailable: vi.fn(() => true),
	onAddonInstalled: vi.fn(
		({ listener }: { listener: () => Promise<void> }) => {
			installListeners.add(listener);
			return () => {
				installListeners.delete(listener);
			};
		},
	),
};

export const appState = { page: { url: new URL("http://localhost/") } };

export const navigation = { goto: vi.fn<(path: string) => Promise<void>>() };

export const account = {
	registerPushToken: vi.fn<(token: PushToken) => Promise<void>>(),
	unregisterPushToken: vi.fn<(token: string) => Promise<void>>(),
};

export const toasts = {
	showErrorToast:
		vi.fn<
			(toast: {
				label: string;
				error: unknown;
				onRetry?: () => void;
			}) => void
		>(),
};

type HintToastOptions = {
	id?: string;
	action?: { label: string; onClick: () => void };
};

export const sonner = {
	toast: {
		error: vi.fn<(label: string, options?: HintToastOptions) => void>(),
	},
};

export const failureLabels = {
	enable: "Couldn’t enable notifications",
	disable: "Couldn’t disable notifications",
	enableFastMode: "Couldn’t enable Fast Mode for push notifications",
	switchToSlowMode: "Couldn’t switch push notifications to Slow Mode",
	relayNoDistributor:
		"Install a UnifiedPush distributor app, such as ntfy, to use fcm-relay",
	relayActionRequired:
		"Finish setting up your UnifiedPush distributor app, then try again",
	relaySetup: "Couldn’t set up fcm-relay",
	relaySave: "Couldn’t save the fcm-relay config",
	relayShare: "Couldn’t share the fcm-relay config",
	relayCodeCheck: "Couldn’t check the verification code",
	relayStopped: "fcm-relay stopped working. Configure Fast Mode again.",
	relayStoppedAction: "Configure",
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
	const record = (step: string) => () => {
		order.push(step);
		return Promise.resolve();
	};
	push.registerRelay.mockImplementation(record("registerRelay"));
	push.unregisterRelay.mockImplementation(record("unregisterRelay"));
	push.forgetRelay.mockImplementation(record("forgetRelay"));
	push.setFastSource.mockImplementation((source) => {
		order.push(`source:${source}`);
		return Promise.resolve();
	});
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

export function hintToast() {
	const [label, options] = sonner.toast.error.mock.lastCall ?? [];
	return { label, options };
}

export function pushFailure(reason: PushErrorReason): Error {
	const error = new Error(reason);
	push.pushErrorReason.mockImplementation((candidate) =>
		candidate === error ? reason : "failed",
	);
	return error;
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

export async function inFast(source: FastSource = "addon") {
	nativeMode("fast");
	push.currentFastSource.mockResolvedValue(source);
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
	push.awaitRelay.mockResolvedValue(undefined);
	push.beginRelaySetup.mockResolvedValue(undefined);
	push.cancelRelaySetup.mockResolvedValue(undefined);
	push.commitRelay.mockResolvedValue({ matched: true });
	push.currentFastSource.mockResolvedValue("addon");
	push.deletePushToken.mockResolvedValue(undefined);
	push.fastModeOptions.mockReturnValue(["addon", "relay"]);
	push.fcmServiceInstalled.mockResolvedValue(true);
	push.forgetRelay.mockResolvedValue(undefined);
	push.playServicesAvailable.mockResolvedValue(true);
	push.registerRelay.mockResolvedValue(undefined);
	push.relayStatus.mockResolvedValue({ paired: true, broken: false });
	push.saveRelayConfig.mockResolvedValue(true);
	push.setFastSource.mockResolvedValue(undefined);
	push.shareRelayConfig.mockResolvedValue(undefined);
	push.unregisterRelay.mockResolvedValue(undefined);
	push.mintPushToken.mockResolvedValue(token);
	push.notificationPermission.mockResolvedValue(granted);
	push.openNotificationSettings.mockResolvedValue(undefined);
	push.pushErrorReason.mockReturnValue("failed");
	push.requestNotificationPermission.mockResolvedValue(granted);
	push.setMode.mockResolvedValue(undefined);
	push.setNotificationsEnabled.mockResolvedValue(undefined);
	addon.addonInstallerAvailable.mockReturnValue(true);
	installNow.mockResolvedValue(undefined);
	appState.page.url = new URL("http://localhost/");
	navigation.goto.mockImplementation((path) => {
		appState.page.url = new URL(path, appState.page.url);
		return Promise.resolve();
	});
	account.registerPushToken.mockResolvedValue(undefined);
	account.unregisterPushToken.mockResolvedValue(undefined);
}

export async function configuredWith(source: FastSource | null) {
	push.currentFastSource.mockResolvedValue(source);
	const module = await freshModule();
	await module.reconcileNotifications();
	vi.clearAllMocks();
	order.length = 0;
	return module;
}

export async function atRelayStep(
	step: "config" | "verify",
	source: FastSource | null = null,
) {
	const module = await configuredWith(source);
	module.openFastModeConfig();
	await module.chooseFastSource("relay");
	if (step === "verify")
		await vi.waitFor(() => {
			expect(module.notificationSettings.relayStep).toBe("verify");
		});
	return module;
}

export function holdRelayConnection() {
	const connection = Promise.withResolvers<void>();
	push.awaitRelay.mockReturnValue(connection.promise);
	return connection;
}
