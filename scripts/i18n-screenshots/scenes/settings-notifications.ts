import type { Page } from "@playwright/test";

import {
	type NativeOverride,
	type NativeOverrides,
	overrideNative,
} from "../stubs";
import type { Scene } from ".";
import { press } from "./press";
import { addingToast, holdToast, waitForNewToast } from "./toast";
import { visit } from "./visit";

const GRANTED = { granted: true, state: "granted" };
const NOTIFICATIONS_PATH = "/settings/app/notifications";
const CATEGORIES = [
	{ category: "messages", enabled: true, systemBlocked: false },
	{ category: "taps", enabled: true, systemBlocked: false },
];
const WRONG_CODE = "123456";

function pushRejection(reason: string): NativeOverride {
	return { reject: { kind: "Push", message: { reason } } };
}

const DESKTOP_PUSH: NativeOverrides = {
	push_notification_permission: { answer: GRANTED },
	push_request_notification_permission: { answer: GRANTED },
	push_categories: { answer: CATEGORIES },
};

const ANDROID_PUSH: NativeOverrides = {
	...DESKTOP_PUSH,
	push_mode: { answer: "slow" },
	push_fast_source: { answer: null },
	push_play_services: { answer: true },
	push_relay_status: { answer: { paired: false, broken: false } },
};

const RELAY_SETUP: NativeOverrides = {
	...ANDROID_PUSH,
	push_relay_begin: { answer: null },
	push_relay_await: { pending: true },
};

const RELAY_CONNECTED: NativeOverrides = {
	...ANDROID_PUSH,
	push_relay_begin: { answer: null },
	push_relay_await: { answer: null },
};

const RELAY_PAIRED: NativeOverrides = {
	...ANDROID_PUSH,
	push_mode: { answer: "fast" },
	push_fast_source: { answer: "relay" },
	push_relay_status: { answer: { paired: true, broken: false } },
};

function notificationsSwitch(page: Page) {
	return page.getByRole("switch", { name: "Enable notifications" });
}

function configureField(page: Page) {
	return page.locator('[data-slot="fast-mode-config-field"] button');
}

function fastModeConfig(page: Page) {
	return page.getByRole("alertdialog", { name: "Configure Fast Mode" });
}

function relayConfig(page: Page) {
	return page.getByRole("alertdialog", { name: "fcm-relay config" });
}

function relayOption(page: Page) {
	return fastModeConfig(page).getByRole("radio", {
		name: "fcm-relay + UnifiedPush",
	});
}

function codeInput(page: Page) {
	return relayConfig(page).getByRole("textbox", {
		name: "Enter verification code",
	});
}

function openNotifications(page: Page): Promise<void> {
	return visit({
		page,
		path: NOTIFICATIONS_PATH,
		ready: notificationsSwitch(page),
	});
}

async function enableNotifications({
	page,
	unlocks,
}: {
	page: Page;
	unlocks: string;
}): Promise<void> {
	await visit({
		page,
		path: NOTIFICATIONS_PATH,
		ready: page.getByRole("switch", { name: unlocks }),
	});
	await press(notificationsSwitch(page));
	await page
		.getByRole("switch", { name: unlocks, disabled: false })
		.waitFor();
}

const enableAndroidNotifications = (page: Page) =>
	enableNotifications({ page, unlocks: "New messages" });

const enableDesktopNotifications = (page: Page) =>
	enableNotifications({ page, unlocks: "Received taps" });

async function openFastModeConfig(page: Page): Promise<void> {
	await press(configureField(page));
	await fastModeConfig(page).waitFor();
}

async function chooseRelay(page: Page): Promise<void> {
	await press(relayOption(page));
	await relayConfig(page).waitFor();
}

async function startRelaySetup(page: Page): Promise<void> {
	await enableAndroidNotifications(page);
	await openFastModeConfig(page);
	await chooseRelay(page);
}

export const androidNotifications: Scene = {
	platform: "phone",
	native: RELAY_SETUP,
	views: [
		{
			id: "settings/notifications",
			drive: async (page) => {
				await enableAndroidNotifications(page);
				await page.getByText("Not available in Slow Mode").waitFor();
			},
		},
		{
			id: "settings/notifications/fast-mode-config",
			screen: "settings/notifications",
			drive: openFastModeConfig,
		},
		{
			id: "settings/notifications/addon",
			screen: "settings/notifications",
			drive: async (page) => {
				await press(
					fastModeConfig(page).getByRole("radio", {
						name: "FCM service add-on",
					}),
				);
				await page
					.getByRole("alertdialog", {
						name: "Install push notifications add-on",
					})
					.waitFor();
			},
		},
		{
			id: "settings/notifications/relay-config",
			screen: "settings/notifications",
			drive: async (page) => {
				const addonPrompt = page.getByRole("alertdialog", {
					name: "Install push notifications add-on",
				});
				await press(
					addonPrompt.getByRole("button", { name: "Cancel" }),
				);
				await addonPrompt.waitFor({ state: "detached" });
				await chooseRelay(page);
				await relayConfig(page)
					.getByRole("button", { name: "Share" })
					.waitFor();
			},
		},
		{
			id: "settings/notifications/relay-waiting",
			screen: "settings/notifications",
			drive: async (page) => {
				await press(
					relayConfig(page).getByRole("button", { name: "Done" }),
				);
				await relayConfig(page)
					.getByRole("status")
					.filter({ hasText: "Waiting for fcm-relay connection…" })
					.waitFor();
			},
		},
		{
			id: "settings/notifications/relay-verify",
			screen: "settings/notifications",
			drive: async (page) => {
				await overrideNative({
					page,
					overrides: { push_relay_await: { answer: null } },
				});
				await press(
					relayConfig(page).getByRole("button", { name: "Cancel" }),
				);
				await relayConfig(page).waitFor({ state: "detached" });
				await chooseRelay(page);
				await codeInput(page).waitFor();
			},
		},
		{
			id: "settings/notifications/relay-wrong-code",
			screen: "settings/notifications",
			drive: async (page) => {
				await overrideNative({
					page,
					overrides: {
						push_relay_commit: { answer: { matched: false } },
					},
				});
				await codeInput(page).fill(WRONG_CODE);
				await relayConfig(page)
					.getByText("Incorrect verification code")
					.waitFor();
			},
		},
	],
};

export const fastModeWithoutPlayServices: Scene = {
	platform: "phone",
	native: { ...ANDROID_PUSH, push_play_services: { answer: false } },
	views: [
		{
			id: "settings/notifications/fast-mode-config-unavailable",
			screen: "settings/notifications",
			drive: async (page) => {
				await enableAndroidNotifications(page);
				await openFastModeConfig(page);
				await fastModeConfig(page).getByText("Not Available").waitFor();
			},
		},
	],
};

export const fcmServiceSource: Scene = {
	platform: "phone",
	native: { ...ANDROID_PUSH, push_fast_source: { answer: "addon" } },
	views: [
		{
			id: "settings/notifications/fcm-service",
			drive: async (page) => {
				await enableAndroidNotifications(page);
				await configureField(page).getByText("FCM service").waitFor();
			},
		},
	],
};

export const fcmRelaySource: Scene = {
	platform: "phone",
	native: RELAY_PAIRED,
	views: [
		{
			id: "settings/notifications/fcm-relay",
			drive: async (page) => {
				await enableAndroidNotifications(page);
				await configureField(page).getByText("fcm-relay").waitFor();
			},
		},
	],
};

export const relaySetupFailures: Scene = {
	platform: "phone",
	native: {
		...ANDROID_PUSH,
		push_relay_begin: {
			sequence: [
				pushRejection("relayNoDistributor"),
				pushRejection("relayActionRequired"),
				pushRejection("relayTimedOut"),
			],
		},
	},
	views: [
		{
			id: "settings/notifications/relay-setup-failed",
			screen: "settings/notifications",
			survivesLocaleSwitch: false,
			drive: async (page) => {
				await enableAndroidNotifications(page);
				await openFastModeConfig(page);
				for (let attempt = 0; attempt < 3; attempt += 1) {
					await waitForNewToast({
						page,
						action: () => press(relayOption(page)),
					});
				}
				await holdToast(page);
			},
		},
	],
};

export const relayConfigFailures: Scene = {
	platform: "phone",
	native: {
		...RELAY_SETUP,
		push_relay_save_config: pushRejection("relaySaveFailed"),
		push_relay_share_config: pushRejection("relayShareFailed"),
	},
	views: [
		{
			id: "settings/notifications/relay-config-failed",
			screen: "settings/notifications",
			survivesLocaleSwitch: false,
			drive: async (page) => {
				await startRelaySetup(page);
				for (const name of ["Save", "Share"]) {
					await waitForNewToast({
						page,
						action: () =>
							press(
								relayConfig(page).getByRole("button", { name }),
							),
					});
				}
				await holdToast(page);
			},
		},
	],
};

export const relayCodeCheckFailure: Scene = {
	platform: "phone",
	native: {
		...RELAY_CONNECTED,
		push_relay_commit: pushRejection("relayNetwork"),
	},
	views: [
		{
			id: "settings/notifications/relay-code-check-failed",
			screen: "settings/notifications",
			survivesLocaleSwitch: false,
			drive: async (page) => {
				await startRelaySetup(page);
				await addingToast({
					page,
					action: () => codeInput(page).fill(WRONG_CODE),
				});
			},
		},
	],
};

export const relayStopped: Scene = {
	platform: "phone",
	native: {
		...RELAY_PAIRED,
		push_relay_register: pushRejection("relayUnpaired"),
	},
	views: [
		{
			id: "settings/notifications/relay-stopped",
			screen: "settings/notifications",
			survivesLocaleSwitch: false,
			drive: async (page) => {
				await openNotifications(page);
				await addingToast({
					page,
					action: () => press(notificationsSwitch(page)),
				});
			},
		},
	],
};

export const notificationCategoryFailure: Scene = {
	platform: "desktop",
	native: { ...DESKTOP_PUSH, push_set_category: pushRejection("failed") },
	views: [
		{
			id: "settings/notifications/category-failed",
			screen: "settings/notifications/macos",
			survivesLocaleSwitch: false,
			drive: async (page) => {
				await enableDesktopNotifications(page);
				await addingToast({
					page,
					action: () =>
						press(
							page.getByRole("switch", { name: "New messages" }),
						),
				});
			},
		},
	],
};

export const macosNotifications: Scene = {
	platform: "desktop",
	native: DESKTOP_PUSH,
	views: [
		{
			id: "settings/notifications/macos",
			drive: enableDesktopNotifications,
		},
	],
};

export const iosNotifications: Scene = {
	platform: "phone",
	shim: "ios",
	views: [
		{
			id: "settings/notifications/ios",
			drive: (page) =>
				visit({
					page,
					path: NOTIFICATIONS_PATH,
					ready: page.getByText(/supported on this platform/),
				}),
		},
	],
};
