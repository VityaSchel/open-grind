import { expect, test } from "@playwright/test";

import {
	ALBUM_TILE,
	DRAWER,
	openAttachments,
	SELECTED_ALBUM_TILE,
} from "./support/drawer";
import { CHAT_MEDIA_HOST, serveImages } from "./support/media";
import { expectNoToast } from "./support/toast";

const MEDIA_TILE = 'button[aria-label="Select media"]';

test.describe("composer albums tab", () => {
	test("each tab arms Send from its own selection", async ({ page }) => {
		await serveImages(page, CHAT_MEDIA_HOST);
		await openAttachments(page);

		await page.getByRole("tab", { name: "Albums" }).click();
		const tiles = page.locator(ALBUM_TILE);
		await expect(tiles.first()).toBeVisible({ timeout: 30_000 });
		await expect(
			page.locator(`${ALBUM_TILE}[disabled]`),
			"a non-shareable album cannot be picked",
		).toHaveCount(1);

		const send = page.getByRole("button", { name: /^Send/ });
		await tiles.first().click();
		await expect(send).toBeVisible();

		await page.getByRole("tab", { name: "Media" }).click();
		await expect(
			send,
			"an album selection must not arm Send on the media tab",
		).toBeHidden();

		await page.getByRole("tab", { name: "Albums" }).click();
		await expect(send).toBeVisible();

		await send.click();
		await expect(page.locator(DRAWER)).toBeHidden();

		await expectNoToast(page, "Couldn't share album");
	});

	test("closing the drawer forgets the selection it was armed with", async ({
		page,
	}) => {
		await serveImages(page, CHAT_MEDIA_HOST);
		await openAttachments(page);

		await page.getByRole("tab", { name: "Albums" }).click();
		const tiles = page.locator(ALBUM_TILE);
		await expect(tiles.first()).toBeVisible({ timeout: 30_000 });

		const send = page.getByRole("button", { name: /^Send/ });
		await tiles.first().click();
		await expect(send).toBeVisible();

		await page.keyboard.press("Escape");
		await expect(page.locator(DRAWER)).toBeHidden();
		await page.getByRole("button", { name: "Add attachment" }).click();
		await expect(page.locator(DRAWER)).toBeVisible();
		await expect(tiles.first()).toBeVisible({ timeout: 30_000 });

		await expect(
			page.locator(SELECTED_ALBUM_TILE),
			"the reopened tab starts with nothing selected",
		).toHaveCount(0);
		await expect(
			send,
			"so Send must not still be armed from the closed drawer",
		).toBeHidden();
	});

	test("album tiles are taller than the square media tiles", async ({
		page,
	}) => {
		await serveImages(page, CHAT_MEDIA_HOST);
		await openAttachments(page);

		const ratio = async (selector: string) => {
			const box = await page.locator(selector).first().boundingBox();
			if (box === null) throw new Error(`no tile for ${selector}`);
			return box.width / box.height;
		};

		await expect(page.locator(MEDIA_TILE).first()).toBeVisible({
			timeout: 30_000,
		});
		expect(await ratio(MEDIA_TILE)).toBeCloseTo(1, 1);

		await page.getByRole("tab", { name: "Albums" }).click();
		await expect(page.locator(ALBUM_TILE).first()).toBeVisible({
			timeout: 30_000,
		});
		expect(await ratio(ALBUM_TILE)).toBeCloseTo(0.75, 1);
	});
});
