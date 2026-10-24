import { expect, test } from "@playwright/test";

import { TrustedTouch } from "./support/app";
import {
	box,
	DRAWER,
	openAttachments,
	SELECTABLE_MEDIA_TILE,
	SHEET_SCROLLER,
} from "./support/drawer";

const BELOW_FLICK_SPEED = { steps: 24, holdMs: 40, release: false };

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
});
