import { expect, type Page, test } from "@playwright/test";

import { installTauriShim } from "./support/app";
import { AVATAR_HOST, CHAT_MEDIA_HOST, serveImages } from "./support/media";

const CONVERSATION_WITH_PLAYED_OUT_VIDEO = "/chat/100006:123456000";
const ALBUM_TRIGGER = 'button[aria-label="Open album"]';
const LIGHTBOX = ".pswp";
const COUNTER = ".pswp__counter";
const ACTIVE_SLIDE = ".pswp__item[aria-hidden=false]";

async function openLastSlide(page: Page): Promise<void> {
	await serveImages(page, CHAT_MEDIA_HOST);
	await serveImages(page, AVATAR_HOST);
	await installTauriShim(page);
	await page.goto(CONVERSATION_WITH_PLAYED_OUT_VIDEO);
	await page.locator(ALBUM_TRIGGER).first().click({ timeout: 60_000 });
	await page.locator(LIGHTBOX).waitFor({ timeout: 30_000 });
	const counter = page.locator(COUNTER);
	await expect(async () => {
		if ((await counter.textContent()) === "1 / 3") {
			await page.keyboard.press("ArrowLeft");
		}
		await expect(counter).toHaveText("3 / 3", { timeout: 1_000 });
	}).toPass({ timeout: 15_000 });
}

test.describe("album video with no plays left", () => {
	test("shows a locked slide instead of a player", async ({ page }) => {
		await openLastSlide(page);

		const slide = page.locator(ACTIVE_SLIDE);
		await expect(slide).toContainText("No plays left");
		await expect(slide.locator("video")).toHaveCount(0);
	});
});
