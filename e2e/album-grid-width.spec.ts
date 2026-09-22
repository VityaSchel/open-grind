import { expect, type Page, test } from "@playwright/test";

import { openAlbums } from "./support/albums";
import { ALBUM_TILE, openAttachments } from "./support/drawer";

const MEDIA_PANEL_WIDTH = 800;
const FORM_COLUMN_WIDTH = 480;

async function albumGrid(page: Page) {
	const tile = page.locator(ALBUM_TILE).first();
	await tile.waitFor({ timeout: 60_000 });
	return await tile.evaluate((element) => {
		const grid = element.closest(".photo-grid");
		if (grid === null)
			throw new Error("The album tile sits outside a grid");
		return {
			columns:
				getComputedStyle(grid).gridTemplateColumns.split(" ").length,
			width: grid.getBoundingClientRect().width,
		};
	});
}

for (const viewport of [
	{ width: 420, height: 800 },
	{ width: 1280, height: 800 },
	{ width: 1920, height: 1000 },
]) {
	test.describe(`at ${viewport.width}px wide`, () => {
		test.use({ viewport });

		test("My Albums lays albums out like the chat drawer's Albums tab", async ({
			page,
		}) => {
			test.setTimeout(120_000);
			await openAlbums(page);
			const mine = await albumGrid(page);

			await openAttachments(page);
			await page.getByRole("tab", { name: "Albums" }).click();
			const drawer = await albumGrid(page);

			expect(mine.columns).toBe(drawer.columns);
			expect(mine.width).toBeLessThanOrEqual(MEDIA_PANEL_WIDTH);
			if (viewport.width > MEDIA_PANEL_WIDTH) {
				expect(mine.width).toBeGreaterThan(FORM_COLUMN_WIDTH);
			}
		});
	});
}
