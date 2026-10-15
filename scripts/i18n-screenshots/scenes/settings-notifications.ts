import type { Page } from "@playwright/test";

import type { NativeOverrides } from "../stubs";
import type { Scene } from ".";
import { ALERT } from "./drive";
import { addingToast } from "./toast";
import { visit } from "./visit";

const GRANTED = { granted: true, state: "granted" };
const NOTIFICATIONS_PATH = "/settings/app/notifications";
const CATEGORIES = [
	{ category: "messages", enabled: true, systemBlocked: false },
	{ category: "taps", enabled: true, systemBlocked: false },
];

const DESKTOP_PUSH: NativeOverrides = {
	push_notification_permission: { answer: GRANTED },
	push_request_notification_permission: { answer: GRANTED },
	push_categories: { answer: CATEGORIES },
};

const ANDROID_PUSH: NativeOverrides = {
	...DESKTOP_PUSH,
	push_mode: { answer: "slow" },
};

function notificationsSwitch(page: Page) {
	return page.getByRole("switch", { name: "Enable notifications" });
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
	await notificationsSwitch(page).click();
	await page
		.getByRole("switch", { name: unlocks, disabled: false })
		.waitFor();
}

const enableAndroidNotifications = (page: Page) =>
	enableNotifications({ page, unlocks: "New messages" });

const enableDesktopNotifications = (page: Page) =>
	enableNotifications({ page, unlocks: "Received taps" });

export const androidNotifications: Scene = {
	platform: "phone",
	native: ANDROID_PUSH,
	views: [
		{
			id: "settings/notifications",
			drive: async (page) => {
				await enableAndroidNotifications(page);
				await page.getByText("Not available in Slow Mode").waitFor();
			},
		},
		{
			id: "settings/notifications/addon",
			screen: "settings/notifications",
			drive: async (page) => {
				await page.getByRole("radio", { name: "Fast Mode" }).click();
				await page.locator(ALERT).waitFor();
			},
		},
	],
};

export const notificationCategoryFailure: Scene = {
	platform: "desktop",
	native: {
		...DESKTOP_PUSH,
		push_set_category: {
			reject: { kind: "Push", message: { reason: "failed" } },
		},
	},
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
						page
							.getByRole("switch", { name: "New messages" })
							.click(),
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
