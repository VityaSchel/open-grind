import { expect, type Page, test } from "@playwright/test";

import { installTauriShim, openGrid } from "./support/app";
import { AVATAR_HOST, CHAT_MEDIA_HOST, serveImages } from "./support/media";

const PROXIED = '[src^="ogmedia:"], [src*="ogmedia.localhost"]';
const IMAGE_CONVERSATION = "/chat/100002:123456000";

async function runDemoInsideTauri(page: Page) {
	await installTauriShim(page, { platform: "macos" });
	await serveImages(page, AVATAR_HOST);
	await serveImages(page, CHAT_MEDIA_HOST);
}

test("the demo never routes media through the scheme handler", async ({
	page,
}) => {
	test.setTimeout(240_000);
	await runDemoInsideTauri(page);

	await openGrid(page);

	const tile = page.locator('a[href^="/profile/"]').first();
	await tile.waitFor({ timeout: 60_000 });
	await expect(page.locator('img[src*="dicebear"]').first()).toBeVisible();
	await expect(page.locator(PROXIED)).toHaveCount(0);

	await tile.click();
	await expect(page).toHaveURL(/\/profile\/\d+$/);
	await expect(page.locator("img").first()).toBeVisible();
	await expect(page.locator(PROXIED)).toHaveCount(0);

	await page.goto(IMAGE_CONVERSATION);
	await expect(page.locator('img[src*="picsum"]').first()).toBeVisible({
		timeout: 60_000,
	});
	await expect(page.locator(PROXIED)).toHaveCount(0);
	await expect(page.locator('a[href^="ogmedia:"]')).toHaveCount(0);
});
