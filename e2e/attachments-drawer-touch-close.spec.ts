import { expect, type Page, test } from "@playwright/test";

import { TrustedTouch } from "./support/app";
import {
	box,
	DRAWER,
	MEDIA_TILE,
	openAttachments,
	SELECTABLE_MEDIA_TILE,
	SHEET_SCROLLER,
} from "./support/drawer";
import { CHAT_MEDIA_HOST, holdImages } from "./support/media";

const BELOW_FLICK_SPEED = { steps: 24, holdMs: 40, release: false };

function loadedTileImages(page: Page): Promise<number> {
	return page
		.locator(`${MEDIA_TILE} img`)
		.evaluateAll(
			(images) =>
				images.filter(
					(image) =>
						image instanceof HTMLImageElement &&
						image.complete &&
						image.naturalWidth > 1,
				).length,
		);
}

test.describe("attachments drawer: touch drag to close", () => {
	for (const origin of ["handle", "tile"] as const) {
		test(`a slow drag down from the ${origin} follows the finger and closes`, async ({
			page,
		}) => {
			await openAttachments(page);
			const touch = await TrustedTouch.attach(page);
			const start = await box(page);
			const tile = (await page
				.locator(SELECTABLE_MEDIA_TILE)
				.first()
				.boundingBox())!;
			const from =
				origin === "handle"
					? { x: 210, y: start.top + 12 }
					: {
							x: tile.x + tile.width / 2,
							y: tile.y + tile.height / 2,
						};

			await touch.drag(
				page,
				from,
				{ x: from.x, y: from.y + 240 },
				BELOW_FLICK_SPEED,
			);
			expect(
				(await box(page)).top - start.top,
				"the sheet is still under the finger, not back at the short size",
			).toBeGreaterThan(200);

			await touch.end();
			await expect(page.locator(DRAWER)).toHaveCount(0);
		});
	}

	test("after scrolling back to the short size, a slow drag down still follows the finger", async ({
		page,
	}) => {
		await openAttachments(page);
		const touch = await TrustedTouch.attach(page);
		const start = await box(page);
		await touch.drag(
			page,
			{ x: 210, y: start.top + 300 },
			{ x: 210, y: start.top - 100 },
			{ steps: 30 },
		);
		await expect
			.poll(async () => (await box(page)).gridScrollTop, {
				message: "content scrolled",
			})
			.toBeGreaterThan(0);
		await touch.drag(
			page,
			{ x: 210, y: 80 },
			{ x: 210, y: 780 },
			{ steps: 40 },
		);
		await expect
			.poll(async () => (await box(page)).sheetScrollTop, {
				message: "back at the short size",
			})
			.toBe(0);
		await expect(page.locator(SHEET_SCROLLER)).toHaveAttribute(
			"data-at-top",
			"",
		);
		const back = await box(page);

		await touch.drag(
			page,
			{ x: 210, y: back.top + 12 },
			{ x: 210, y: back.top + 252 },
			BELOW_FLICK_SPEED,
		);
		expect(
			(await box(page)).top - back.top,
			"the sheet is still under the finger",
		).toBeGreaterThan(200);

		await touch.end();
		await expect(page.locator(DRAWER)).toHaveCount(0);
	});

	test("a slow drag down keeps following the finger while images load under a resting mouse", async ({
		page,
	}) => {
		const images = await holdImages(page, CHAT_MEDIA_HOST);
		await openAttachments(page);
		const tile = (await page
			.locator(SELECTABLE_MEDIA_TILE)
			.first()
			.boundingBox())!;
		await page.mouse.move(
			tile.x + tile.width / 2,
			tile.y + tile.height / 2,
		);
		const touch = await TrustedTouch.attach(page);
		const start = await box(page);
		const from = { x: 210, y: start.top + 12 };
		const halfway = { x: from.x, y: from.y + 120 };

		await touch.drag(page, from, halfway, {
			...BELOW_FLICK_SPEED,
			steps: 12,
		});
		await images.release();
		await expect
			.poll(() => loadedTileImages(page), {
				message: "the tiles' images loaded",
			})
			.toBeGreaterThan(0);
		for (let step = 1; step <= 12; step++) {
			await touch.move(halfway.x, halfway.y + step * 10);
			await page.waitForTimeout(BELOW_FLICK_SPEED.holdMs);
		}
		expect(
			(await box(page)).top - start.top,
			"the sheet is still under the finger",
		).toBeGreaterThan(200);

		await touch.end();
		await expect(page.locator(DRAWER)).toHaveCount(0);
	});
});
