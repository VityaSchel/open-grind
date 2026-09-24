import { expect, test } from "@playwright/test";

import { MEDIA_TILE, openAttachments } from "./support/drawer";
import { CHAT_MEDIA_HOST, holdImages, serveImages } from "./support/media";

const LIFTED = '[data-slot="media-tile-lifted"]';

test.describe("media tile menu", () => {
	test("the lifted copy keeps the corners of the tile it lifts", async ({
		page,
	}) => {
		await serveImages(page, CHAT_MEDIA_HOST);
		await openAttachments(page);
		const corners = await page
			.locator(MEDIA_TILE)
			.evaluateAll((tiles) =>
				tiles.map((tile) => getComputedStyle(tile).borderRadius),
			);
		const rounded = corners.findIndex((radius) => radius !== "0px");
		const square = corners.indexOf("0px");
		expect(rounded).toBeGreaterThanOrEqual(0);
		expect(square).toBeGreaterThanOrEqual(0);

		for (const index of [rounded, square]) {
			await page
				.locator(MEDIA_TILE)
				.nth(index)
				.click({ button: "right" });
			await expect(page.locator(LIFTED)).toHaveCSS(
				"border-radius",
				corners[index]!,
			);
			await page.keyboard.press("Escape");
			await expect(page.locator(LIFTED)).toHaveCount(0);
		}
	});

	test("the menu is wide enough for its item's label", async ({ page }) => {
		await serveImages(page, CHAT_MEDIA_HOST);
		await openAttachments(page);
		await page.locator(MEDIA_TILE).first().click({ button: "right" });

		const menu = page.getByRole("menu", { name: "Photo options" });
		const item = menu.getByRole("menuitem", { name: "Delete permanently" });
		await expect(item).toBeVisible();
		expect(
			await item.evaluate((button) => {
				const panel = button.closest('[role="menu"]')!;
				return (
					button.scrollWidth <= button.clientWidth &&
					button.getBoundingClientRect().right <=
						panel.getBoundingClientRect().right
				);
			}),
		).toBe(true);
	});

	test("a tile that loads while its menu is open shows its photo in the lifted copy", async ({
		page,
	}) => {
		const images = await holdImages(page, CHAT_MEDIA_HOST);
		await openAttachments(page);
		await expect.poll(images.requested).toBeGreaterThan(0);
		const tile = page.locator(MEDIA_TILE).first();

		await tile.click({ button: "right" });
		const lifted = page.locator(LIFTED);
		await expect(lifted).toBeVisible();
		await expect(lifted.locator("img")).toHaveCount(0);

		await images.release();
		await expect(lifted.locator("img")).toHaveJSProperty("complete", true);
		expect(
			await lifted
				.locator("img")
				.evaluate((image: HTMLImageElement) => image.naturalWidth),
		).toBeGreaterThan(1);
	});
});
