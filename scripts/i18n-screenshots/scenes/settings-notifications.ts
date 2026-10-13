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

const ANDROID_PUSH: NativeOverrides = {
	push_notification_permission: { answer: GRANTED },
	push_request_notification_permission: { answer: GRANTED },
	push_mode: { answer: "slow" },
	push_categories: { answer: CATEGORIES },
};

function notificationsSwitch(page: Page) {
	return page.getByRole("switch", { name: "Enable notifications" });
}

async function enableNotifications(page: Page): Promise<void> {
	await visit({
		page,
		path: NOTIFICATIONS_PATH,
		ready: page.getByRole("switch", { name: "Received taps" }),
	});
	await notificationsSwitch(page).click();
	await page
		.getByRole("switch", { name: "Received taps", disabled: false })
		.waitFor();
}

export const androidNotifications: Scene = {
	platform: "phone",
	native: ANDROID_PUSH,
	views: [
		{ id: "settings/notifications", drive: enableNotifications },
		{
			id: "settings/notifications/addon",
			drive: async (page) => {
				await page.getByRole("radio", { name: "Fast Mode" }).click();
				await page.locator(ALERT).waitFor();
			},
		},
	],
};

export const notificationCategoryFailure: Scene = {
	platform: "phone",
	native: {
		...ANDROID_PUSH,
		push_set_category: {
			reject: { kind: "Push", message: { reason: "failed" } },
		},
	},
	views: [
		{
			id: "settings/notifications/category-failed",
			survivesLocaleSwitch: false,
			drive: async (page) => {
				await enableNotifications(page);
				await addingToast({
					page,
					action: () =>
						page
							.getByRole("switch", { name: "Received taps" })
							.click(),
				});
			},
		},
	],
};

function unsupportedOn({
	id,
	platform,
	shim,
	notice,
}: {
	id: string;
	platform: Scene["platform"];
	shim?: Scene["shim"];
	notice: RegExp;
}): Scene {
	return {
		platform,
		shim,
		views: [
			{
				id,
				drive: (page) =>
					visit({
						page,
						path: NOTIFICATIONS_PATH,
						ready: page.getByText(notice),
					}),
			},
		],
	};
}

export const macosNotifications = unsupportedOn({
	id: "settings/notifications/macos",
	platform: "desktop",
	notice: /supported on macOS/,
});

export const iosNotifications = unsupportedOn({
	id: "settings/notifications/ios",
	platform: "phone",
	shim: "ios",
	notice: /supported on this platform/,
});
