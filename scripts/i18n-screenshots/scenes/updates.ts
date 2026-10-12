import type { Page } from "@playwright/test";

import type { Scene } from ".";
import { holdToast } from "./toast";
import { visit } from "./visit";

async function openAppSettings(page: Page): Promise<void> {
	await visit({
		page,
		path: "/settings/app",
		ready: page.getByRole("main").getByRole("heading"),
	});
}

export const upToDateToast: Scene = {
	platform: "phone",
	views: [
		{
			id: "updates/up-to-date",
			survivesLocaleSwitch: false,
			drive: async (page) => {
				await openAppSettings(page);
				await page.evaluate(() =>
					window.__openGrindScreenshots
						?.updateToasts("app")
						.upToDate(),
				);
				await holdToast(page);
			},
		},
	],
};

export const downloadToast: Scene = {
	platform: "phone",
	demo: { updates: true },
	views: [
		{
			id: "updates/downloading",
			survivesLocaleSwitch: false,
			drive: async (page) => {
				await openAppSettings(page);
				await page.evaluate(() => {
					const ignore = () => {};
					window.__openGrindScreenshots
						?.updateToasts("app")
						.show({
							kind: "update",
							view: {
								stage: "downloading",
								received: 23_400_000,
								total: 61_800_000,
							},
							onActivate: ignore,
							onCancel: ignore,
							onDismiss: ignore,
						});
				});
				await holdToast(page);
			},
		},
	],
};
