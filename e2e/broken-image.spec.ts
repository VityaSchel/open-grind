import { expect, test } from "@playwright/test";

import { installTauriShim } from "./support/app";
import {
	abortImages,
	AVATAR_HOST,
	CHAT_MEDIA_HOST,
	serveImages,
} from "./support/media";

const BROKEN = '[data-slot="broken-media"]';
const IMAGE_CONVERSATION = "/chat/100006:123456000";
const FIRST_LOAD_TIMEOUT = 120_000;

test.describe("broken images", () => {
	test("loaded avatars never show the placeholder", async ({ page }) => {
		await installTauriShim(page);
		await serveImages(page, AVATAR_HOST);
		await page.goto("/interest/taps");
		const avatar = page.locator('a[href^="/profile/"] img').first();
		await avatar.waitFor({ timeout: FIRST_LOAD_TIMEOUT });
		await expect
			.poll(() =>
				avatar.evaluate(
					(img) =>
						img instanceof HTMLImageElement && img.naturalWidth > 0,
				),
			)
			.toBe(true);

		await expect(page.locator(BROKEN)).toHaveCount(0);
	});

	test("a failing avatar becomes a placeholder with the same footprint", async ({
		page,
	}) => {
		await installTauriShim(page);
		await abortImages(page, AVATAR_HOST);
		await page.goto("/interest/taps");

		const broken = page.locator(`a[href^="/profile/"] ${BROKEN}`).first();
		await broken.waitFor({ timeout: FIRST_LOAD_TIMEOUT });
		await expect(page.locator('img[src*="dicebear"]')).toHaveCount(0);

		const boundingBox = await broken.boundingBox();
		expect(boundingBox?.width).toBe(80);
		expect(boundingBox?.height).toBe(80);
	});

	test("a cached failure still renders the placeholder on revisit", async ({
		page,
	}) => {
		await installTauriShim(page);
		await page.route(AVATAR_HOST, (route) =>
			route.fulfill({
				status: 404,
				headers: { "cache-control": "max-age=300" },
				body: "not found",
			}),
		);
		await page.goto("/interest/taps");
		await page
			.locator(BROKEN)
			.first()
			.waitFor({ timeout: FIRST_LOAD_TIMEOUT });

		await page.getByRole("link", { name: "Views" }).click();
		await expect(page).toHaveURL(/\/interest\/views$/);
		await page.getByRole("link", { name: "Taps" }).click();
		await expect(page).toHaveURL(/\/interest\/taps$/);

		await page.locator(BROKEN).first().waitFor({ timeout: 60_000 });
	});

	test("a broken profile photo fills the carousel and cannot open the lightbox", async ({
		page,
	}) => {
		await installTauriShim(page);
		await abortImages(page, AVATAR_HOST);
		await page.goto("/interest/taps");
		const profileLink = page.locator('a[href^="/profile/"]').first();
		await profileLink.waitFor({ timeout: FIRST_LOAD_TIMEOUT });
		await profileLink.click();
		await expect(page).toHaveURL(/\/profile\/\d+/);

		const slide = page.locator(`.item ${BROKEN}`).first();
		await slide.waitFor({ timeout: 60_000 });
		const boundingBox = await slide.boundingBox();
		expect(boundingBox?.width).toBeGreaterThan(300);
		expect(boundingBox?.height).toBeGreaterThan(300);

		await slide.click();
		await page.waitForTimeout(1_000);
		await expect(page.locator(".pswp")).toHaveCount(0);
	});

	test("loaded photos still open their lightboxes", async ({ page }) => {
		await installTauriShim(page);
		await serveImages(page, AVATAR_HOST);
		await serveImages(page, CHAT_MEDIA_HOST);
		await page.goto("/interest/taps");
		const profileLink = page.locator('a[href^="/profile/"]').first();
		await profileLink.waitFor({ timeout: FIRST_LOAD_TIMEOUT });
		await profileLink.click();
		await expect(page).toHaveURL(/\/profile\/\d+/);

		const slide = page.locator(".item[href]").first();
		await slide.waitFor({ timeout: 60_000 });
		await slide.click();
		await expect(page.locator(".pswp")).toHaveCount(1);
		await page.keyboard.press("Escape");

		await page.goto(IMAGE_CONVERSATION);
		const photo = page.locator('a[aria-label="Photo"][href]').first();
		await photo.waitFor({ timeout: FIRST_LOAD_TIMEOUT });
		await expect
			.poll(() =>
				photo
					.locator("img")
					.evaluate(
						(img) =>
							img instanceof HTMLImageElement &&
							img.naturalWidth > 0,
					),
			)
			.toBe(true);
		await photo.click();
		await expect(page.locator(".pswp")).toHaveCount(1);
	});

	test("a broken chat image keeps its bubble and the lightbox shows the error icon", async ({
		page,
	}) => {
		await installTauriShim(page);
		await abortImages(page, CHAT_MEDIA_HOST);
		await page.goto(IMAGE_CONVERSATION);

		const bubble = page.locator(`a[aria-label="Photo"] ${BROKEN}`).first();
		await bubble.waitFor({ timeout: FIRST_LOAD_TIMEOUT });
		const boundingBox = await bubble.boundingBox();
		expect(boundingBox).not.toBeNull();
		expect(boundingBox!.width).toBeGreaterThan(100);
		expect(
			Math.abs(boundingBox!.height - (boundingBox!.width * 4) / 3),
		).toBeLessThan(2);

		await bubble.click();
		await page.waitForTimeout(1_000);
		await expect(page.locator(".pswp")).toHaveCount(0);

		await page
			.getByRole("button", { name: "View expiring image" })
			.last()
			.click();
		const errorSlide = page.locator(
			'.pswp [role="img"][aria-label="Media failed to load"]',
		);
		await errorSlide.waitFor({ timeout: 60_000 });
		await expect(errorSlide.locator("svg")).toBeVisible();
		await expect(page.getByText("The image cannot be loaded")).toHaveCount(
			0,
		);
	});
});
