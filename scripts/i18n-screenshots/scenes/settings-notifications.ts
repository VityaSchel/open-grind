import type { Page } from "@playwright/test";

import { animationsFinished } from "../../../e2e/support/app";

import {
	type NativeOverride,
	type NativeOverrides,
	overrideNative,
} from "../stubs";
import { showsLoading } from "../settle";
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
const RIGHT_CODE = "658591";
const ONBOARDED = { onboardingComplete: true };

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

const ADDON_IN_USE: NativeOverrides = {
	...ANDROID_PUSH,
	push_mode: { answer: "fast" },
	push_fast_source: { answer: "addon" },
	push_token: {
		answer: { token: "fid:APA91b", vendorProvidedIdentifier: "fid" },
	},
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

function fastModeSelected(page: Page) {
	return page.getByRole("radio", {
		name: /^Fast Mode/,
		checked: true,
		disabled: false,
	});
}

function configureField(page: Page) {
	return page.locator('[data-slot="fast-mode-config-field"] button');
}

function fastModeConfig(page: Page) {
	return page.getByRole("dialog", { name: "Configure Fast Mode" });
}

function relayConfig(page: Page) {
	return page
		.getByRole("dialog")
		.filter({ has: page.getByRole("img", { name: /Step \d of 3/ }) });
}

function setupButton({ page, title }: { page: Page; title: string }) {
	return fastModeConfig(page)
		.getByRole("listitem")
		.filter({ has: page.getByRole("heading", { name: title }) })
		.getByRole("button");
}

function addonSetup(page: Page) {
	return setupButton({ page, title: "FCM service add-on" });
}

function relaySetup(page: Page) {
	return setupButton({ page, title: "fcm-relay + UnifiedPush" });
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
	await animationsFinished(fastModeConfig(page));
}

async function chooseRelay(page: Page): Promise<void> {
	await press(relaySetup(page));
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
	preferences: ONBOARDED,
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
				await press(addonSetup(page));
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
					relayConfig(page).getByRole("button", { name: "Continue" }),
				);
				await relayConfig(page)
					.getByRole("status")
					.filter({ hasText: "Waiting for fcm-relay connection…" })
					.waitFor();
				showsLoading(page);
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
		{
			id: "settings/notifications/relay-connected",
			screen: "settings/notifications",
			drive: async (page) => {
				await overrideNative({
					page,
					overrides: {
						push_relay_commit: { answer: { matched: true } },
					},
				});
				await codeInput(page).fill(RIGHT_CODE);
				await page
					.getByRole("dialog", { name: "fcm-relay connected" })
					.getByRole("button", { name: "Continue" })
					.waitFor();
			},
		},
	],
};

export const fastModeWithoutPlayServices: Scene = {
	platform: "phone",
	native: { ...ANDROID_PUSH, push_play_services: { answer: false } },
	preferences: ONBOARDED,
	views: [
		{
			id: "settings/notifications/fast-mode-config-unavailable",
			screen: "settings/notifications",
			drive: async (page) => {
				await enableAndroidNotifications(page);
				await openFastModeConfig(page);
				await fastModeConfig(page).getByText("Not available").waitFor();
			},
		},
	],
};

export const fcmServiceSource: Scene = {
	platform: "phone",
	native: ADDON_IN_USE,
	preferences: ONBOARDED,
	views: [
		{
			id: "settings/notifications/fcm-service",
			drive: async (page) => {
				await enableAndroidNotifications(page);
				await configureField(page).getByText("FCM service").waitFor();
				await fastModeSelected(page).waitFor();
			},
		},
		{
			id: "settings/notifications/fast-mode-config-fcm-service",
			screen: "settings/notifications",
			drive: async (page) => {
				await openFastModeConfig(page);
				await fastModeConfig(page).getByText("Selected").waitFor();
			},
		},
	],
};

export const fcmRelaySource: Scene = {
	platform: "phone",
	native: RELAY_PAIRED,
	preferences: ONBOARDED,
	views: [
		{
			id: "settings/notifications/fcm-relay",
			drive: async (page) => {
				await enableAndroidNotifications(page);
				await configureField(page).getByText("fcm-relay").waitFor();
			},
		},
		{
			id: "settings/notifications/fast-mode-config-fcm-relay",
			screen: "settings/notifications",
			drive: async (page) => {
				await openFastModeConfig(page);
				await relaySetup(page).getByText("Modify").waitFor();
			},
		},
	],
};

export const addonSetupFailure: Scene = {
	platform: "phone",
	native: {
		...ANDROID_PUSH,
		updater_installed_version: { answer: "1.0.0" },
		push_addon_ready: pushRejection("addonUnavailable"),
	},
	preferences: ONBOARDED,
	demo: { updates: true },
	views: [
		{
			id: "settings/notifications/addon-failed",
			screen: "settings/notifications",
			survivesLocaleSwitch: false,
			drive: async (page) => {
				await enableAndroidNotifications(page);
				await openFastModeConfig(page);
				await addingToast({
					page,
					action: () => press(addonSetup(page)),
				});
			},
		},
	],
};

async function failRelaySetup(page: Page): Promise<void> {
	await waitForNewToast({ page, action: () => press(relaySetup(page)) });
	await holdToast(page);
}

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
	preferences: ONBOARDED,
	views: [
		{
			id: "settings/notifications/relay-no-distributor",
			screen: "settings/notifications",
			survivesLocaleSwitch: false,
			drive: async (page) => {
				await enableAndroidNotifications(page);
				await openFastModeConfig(page);
				await failRelaySetup(page);
			},
		},
		{
			id: "settings/notifications/relay-action-required",
			screen: "settings/notifications",
			survivesLocaleSwitch: false,
			drive: failRelaySetup,
		},
		{
			id: "settings/notifications/relay-setup-failed",
			screen: "settings/notifications",
			survivesLocaleSwitch: false,
			drive: failRelaySetup,
		},
	],
};

async function failConfigExport({
	page,
	name,
}: {
	page: Page;
	name: string;
}): Promise<void> {
	await waitForNewToast({
		page,
		action: () => press(relayConfig(page).getByRole("button", { name })),
	});
	await holdToast(page);
}

export const relayConfigFailures: Scene = {
	platform: "phone",
	native: {
		...RELAY_SETUP,
		push_relay_save_config: pushRejection("relaySaveFailed"),
		push_relay_share_config: pushRejection("relayShareFailed"),
	},
	preferences: ONBOARDED,
	views: [
		{
			id: "settings/notifications/relay-config-failed",
			screen: "settings/notifications",
			survivesLocaleSwitch: false,
			drive: async (page) => {
				await startRelaySetup(page);
				await failConfigExport({ page, name: "Save" });
			},
		},
		{
			id: "settings/notifications/relay-share-failed",
			screen: "settings/notifications",
			survivesLocaleSwitch: false,
			drive: (page) => failConfigExport({ page, name: "Share" }),
		},
	],
};

export const relayCodeCheckFailure: Scene = {
	platform: "phone",
	native: {
		...RELAY_CONNECTED,
		push_relay_commit: pushRejection("relayNetwork"),
	},
	preferences: ONBOARDED,
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
	preferences: ONBOARDED,
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
