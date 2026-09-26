import { expect, test } from "@playwright/test";

import { attachApp, liveDevice } from "./support/device";

test("Playwright reads the app's page on the live emulator", async () => {
	const { browser, page } = await attachApp();
	try {
		expect(new URL(page.url()).origin).toBe(liveDevice.appOrigin);
		await expect(page.getByRole("button").first()).toBeVisible({
			timeout: 60_000,
		});
	} finally {
		await browser.close();
	}
});
