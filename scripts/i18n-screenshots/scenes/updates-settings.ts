import type { Page } from "@playwright/test";

import { type NativeOverrides, overrideNative } from "../stubs";
import type { Scene } from ".";
import { ALERT, emitEvent } from "./drive";
import { holdToast, SHOWN_TOAST, waitForNewToast } from "./toast";
import { visit } from "./visit";

const PUSH_FAILED = { kind: "Push", message: { reason: "failed" } };
const GRANTED = { granted: true, state: "granted" };
const NOTIFICATIONS_ALLOWED: NativeOverrides = {
	push_notification_permission: { answer: GRANTED },
	push_request_notification_permission: { answer: GRANTED },
};
const LIVE_TOAST = `${SHOWN_TOAST}:not([data-removed="true"])`;
const STAGE_PROGRESS = `${LIVE_TOAST} [data-slot="progress"]`;
const TAPPABLE_TOAST = `${LIVE_TOAST} [role="button"]`;
const DOWNLOAD_BYTES = 61_800_000;
const NEXT_RELEASE = { tag: "v1.3.0", version: "1.3.0", kind: "update" };
const DOWNLOAD_PROGRESS = {
	...NEXT_RELEASE,
	component: "app",
	total: DOWNLOAD_BYTES,
};

function artifact({ name, size }: { name: string; size: number }) {
	return {
		name,
		size,
		url: `http://localhost/${name}`,
		uuid: "00000000-0000-4000-8000-000000000000",
	};
}

const RELEASE = {
	...NEXT_RELEASE,
	component: "app",
	payload: artifact({ name: "open-grind.app.tar.gz", size: DOWNLOAD_BYTES }),
	signature: artifact({ name: "open-grind.app.tar.gz.sig", size: 400 }),
};

function unsupported(detail: Record<string, unknown>): NativeOverrides {
	return { updater_capability: { answer: { state: "unsupported", detail } } };
}

const FDROID_MANAGED = unsupported({
	reason: "externallyManaged",
	detail: { installer: "org.fdroid.fdroid" },
});

function openUpdateSettings(page: Page): Promise<void> {
	return visit({
		page,
		path: "/settings/app/updates",
		ready: automaticChecksSwitch(page),
	});
}

function checkForUpdatesButton(page: Page) {
	return page.getByRole("button", { name: "Check for updates" });
}

function checkForUpdates(page: Page): Promise<void> {
	return waitForNewToast({
		page,
		action: () => checkForUpdatesButton(page).click(),
	});
}

function automaticChecksSwitch(page: Page) {
	return page.getByRole("switch", { name: /updates automatically/ });
}

function notificationsSwitch(page: Page) {
	return page.getByRole("switch", { name: "Enable notifications" });
}

function openNotifications(page: Page): Promise<void> {
	return visit({
		page,
		path: "/settings/app/notifications",
		ready: notificationsSwitch(page),
	});
}

async function enableNotifications(page: Page): Promise<void> {
	await notificationsSwitch(page).click();
	await page
		.getByRole("switch", { name: "Enable notifications", checked: true })
		.waitFor();
}

function toggleNotificationsFailing({
	page,
	overrides,
}: {
	page: Page;
	overrides: NativeOverrides;
}): Promise<void> {
	return waitForNewToast({
		page,
		action: async () => {
			await overrideNative({ page, overrides });
			await notificationsSwitch(page).click();
		},
	});
}

export const appUpdateSettings: Scene = {
	platform: "desktop",
	demo: { updates: true },
	views: [
		{
			id: "settings/updates/app",
			screen: "settings/updates/blocked",
			survivesLocaleSwitch: false,
			drive: async (page) => {
				await openUpdateSettings(page);
				await overrideNative({
					page,
					overrides: {
						updater_check: { reject: "The release server is down" },
					},
				});
				await checkForUpdates(page);
				await holdToast(page);
			},
		},
	],
};

export const appAndAddonUpdateSettings: Scene = {
	platform: "phone",
	demo: { updates: true },
	views: [
		{
			id: "settings/updates/app-and-addons",
			survivesLocaleSwitch: false,
			drive: async (page) => {
				await openUpdateSettings(page);
				await overrideNative({
					page,
					overrides: {
						updater_set_auto_check: { reject: "Storage is full" },
					},
				});
				await waitForNewToast({
					page,
					action: () => automaticChecksSwitch(page).click(),
				});
				await checkForUpdates(page);
				await holdToast(page);
			},
		},
	],
};

export const addonUpdateSettings: Scene = {
	platform: "phone",
	demo: { updates: true },
	native: FDROID_MANAGED,
	views: [
		{
			id: "settings/updates/addons-only",
			survivesLocaleSwitch: false,
			drive: async (page) => {
				await openUpdateSettings(page);
				await checkForUpdates(page);
				await holdToast(page);
			},
		},
	],
};

export const fdroidAddonAlert: Scene = {
	platform: "phone",
	demo: { updates: true },
	native: { ...FDROID_MANAGED, ...NOTIFICATIONS_ALLOWED },
	views: [
		{
			id: "settings/notifications/fdroid-addon",
			screen: "settings/notifications",
			drive: async (page) => {
				await openNotifications(page);
				await enableNotifications(page);
				await page.getByRole("radio", { name: "Fast Mode" }).click();
				await page.locator(ALERT).waitFor();
			},
		},
	],
};

export const undeterminedUpdateSettings: Scene = {
	platform: "phone",
	demo: { updates: true },
	native: {
		...unsupported({ reason: "undetermined" }),
		updater_settings: { reject: "Settings are unreadable" },
	},
	views: [
		{
			id: "settings/updates/addons-only-with-reason",
			survivesLocaleSwitch: false,
			drive: async (page) => {
				await openUpdateSettings(page);
				await holdToast(page);
			},
		},
	],
};

export const blockedUpdateSettings: Scene = {
	platform: "desktop",
	demo: { updates: true },
	native: unsupported({
		reason: "locationNotWritable",
		detail: { path: "/opt/open-grind" },
	}),
	views: [{ id: "settings/updates/blocked", drive: openUpdateSettings }],
};

export const pushFailures: Scene = {
	platform: "phone",
	demo: { updates: true },
	views: [
		{
			id: "settings/notifications/push-errors",
			screen: "settings/notifications",
			survivesLocaleSwitch: false,
			drive: async (page) => {
				await openNotifications(page);
				await toggleNotificationsFailing({
					page,
					overrides: {
						push_notification_permission: { reject: PUSH_FAILED },
					},
				});
				await toggleNotificationsFailing({
					page,
					overrides: {
						...NOTIFICATIONS_ALLOWED,
						push_mode: { answer: "fast" },
						push_token: { reject: PUSH_FAILED },
						push_set_mode: { reject: PUSH_FAILED },
					},
				});
				await toggleNotificationsFailing({
					page,
					overrides: {
						push_set_notifications_enabled: { reject: PUSH_FAILED },
					},
				});
				await holdToast(page);
			},
		},
	],
};

export const fastModeFailure: Scene = {
	platform: "phone",
	demo: { updates: true },
	native: NOTIFICATIONS_ALLOWED,
	views: [
		{
			id: "settings/notifications/fast-mode-failed",
			screen: "settings/notifications",
			survivesLocaleSwitch: false,
			drive: async (page) => {
				await openNotifications(page);
				await enableNotifications(page);
				await overrideNative({
					page,
					overrides: {
						updater_installed_version: { answer: "1.0.0" },
						push_addon_ready: { reject: PUSH_FAILED },
					},
				});
				await waitForNewToast({
					page,
					action: () =>
						page.getByRole("radio", { name: "Fast Mode" }).click(),
				});
				await holdToast(page);
			},
		},
	],
};

export const manualInstall: Scene = {
	platform: "desktop",
	demo: { updates: true },
	native: {
		updater_check: {
			answer: {
				available: true,
				currentVersion: "1.2.0",
				release: RELEASE,
			},
		},
		updater_download: {
			answer: { ...DOWNLOAD_PROGRESS, phase: "downloading", received: 0 },
		},
		updater_readiness: {
			answer: {
				state: "ready",
				detail: { ...NEXT_RELEASE, canInstallNow: true },
			},
		},
		updater_install: { reject: { kind: "needsManualInstall" } },
	},
	views: [
		{
			id: "updates/manual-install",
			screen: "settings/updates/blocked",
			survivesLocaleSwitch: false,
			drive: async (page) => {
				await openUpdateSettings(page);
				await checkForUpdatesButton(page).click();
				await page.locator(TAPPABLE_TOAST).click();
				await page.locator(`${LIVE_TOAST} [role="status"]`).waitFor();
				await emitEvent({
					page,
					event: "updater:progress",
					payload: {
						...DOWNLOAD_PROGRESS,
						phase: "ready",
						received: DOWNLOAD_BYTES,
					},
				});
				await page.locator(TAPPABLE_TOAST).click();
				await page
					.locator(STAGE_PROGRESS)
					.waitFor({ state: "detached" });
				await page.locator(`${LIVE_TOAST} [role="status"]`).waitFor();
				await holdToast(page);
			},
		},
	],
};
