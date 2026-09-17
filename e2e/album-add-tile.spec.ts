import { expect, type Locator, test } from "@playwright/test";

import { MEDIA_SLOT, openAlbum, TWO_ROW_ALBUM } from "./support/albums";

const ADD_TILE = '[data-slot="add-media-tile"]';

async function box(locator: Locator) {
	const measured = await locator.boundingBox();
	if (!measured) throw new Error("Nothing to measure");
	return measured;
}

for (const viewport of [
	{ width: 420, height: 800 },
	{ width: 1280, height: 800 },
]) {
	test.describe(`at ${viewport.width}px wide`, () => {
		test.use({ viewport });

		test("the add tile is exactly the size of a media slot", async ({
			page,
		}) => {
			test.setTimeout(120_000);
			await openAlbum(page, TWO_ROW_ALBUM);
			const tile = await box(page.locator(ADD_TILE));
			const slot = await box(page.locator(MEDIA_SLOT).first());
			expect(Math.abs(tile.width - slot.width)).toBeLessThanOrEqual(1);
			expect(Math.abs(tile.height - slot.height)).toBeLessThanOrEqual(1);
			expect(Math.abs(tile.y - slot.y)).toBeLessThanOrEqual(1);

			const label = await box(
				page.locator(ADD_TILE).getByText("Add photos or videos"),
			);
			expect(label.x).toBeGreaterThanOrEqual(tile.x);
			expect(label.x + label.width).toBeLessThanOrEqual(
				tile.x + tile.width,
			);
			expect(label.y + label.height).toBeLessThanOrEqual(
				tile.y + tile.height,
			);
		});
	});
}
