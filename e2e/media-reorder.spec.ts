import { expect, type Page, test } from "@playwright/test";

import {
	back,
	MEDIA_SLOT_CELL as CELL,
	openSharedAlbum,
	SHARED_ALBUM,
} from "./support/albums";
import { installTauriShim, TrustedTouch } from "./support/app";
import { CHAT_MEDIA_HOST, serveImages } from "./support/media";

function mediaOrder(page: Page) {
	return page
		.locator(`${CELL} img`)
		.evaluateAll((nodes) =>
			nodes.map((node) => node.getAttribute("src") ?? ""),
		);
}

async function centerOf(page: Page, index: number) {
	const box = await page.locator(CELL).nth(index).boundingBox();
	expect(box, `cell ${index} is laid out`).not.toBeNull();
	return { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 };
}

test.describe("media reorder", () => {
	test("a touch drag needs a hold, then carries the tile to a new slot", async ({
		page,
	}) => {
		await openSharedAlbum(page);
		const before = await mediaOrder(page);
		expect(before.length).toBe(3);

		const first = await centerOf(page, 0);
		const third = await centerOf(page, 2);
		const touch = await TrustedTouch.attach(page);

		await touch.drag(page, first, third, { steps: 20, holdMs: 30 });
		await page.waitForTimeout(400);
		expect(
			await mediaOrder(page),
			"moving straight away is a scroll, however long it lasts",
		).toEqual(before);

		await touch.start(first.x, first.y);
		await page.waitForTimeout(500);
		for (let step = 1; step <= 12; step++) {
			await touch.move(
				first.x + ((third.x - first.x) * step) / 12,
				first.y + ((third.y - first.y) * step) / 12,
			);
			await page.waitForTimeout(20);
		}
		await touch.end();
		await page.waitForTimeout(600);

		const after = await mediaOrder(page);
		expect(after, "the held tile landed last").toEqual([
			before[1],
			before[2],
			before[0],
		]);
	});

	test("the new order is what the album reloads with", async ({ page }) => {
		await openSharedAlbum(page);
		const before = await mediaOrder(page);

		const third = await centerOf(page, 2);
		const first = await centerOf(page, 0);
		await page.mouse.move(third.x, third.y);
		await page.mouse.down();
		await page.mouse.move(first.x, first.y, { steps: 12 });
		await page.mouse.up();
		await page.waitForTimeout(600);

		const reordered = await mediaOrder(page);
		expect(reordered).not.toEqual(before);
		await page.getByRole("button", { name: "Save changes" }).click();
		await expect(
			page.getByRole("button", { name: "Save changes" }),
		).toBeHidden({ timeout: 30_000 });

		await back(page);
		await page.locator(SHARED_ALBUM).click();
		await page.locator(CELL).first().waitFor({ timeout: 30_000 });
		await page.waitForTimeout(500);

		expect(
			await mediaOrder(page),
			"the server kept the order we sent",
		).toEqual(reordered);
	});

	test("a drag that ends where it began changes nothing", async ({
		page,
	}) => {
		await openSharedAlbum(page);
		const before = await mediaOrder(page);

		const first = await centerOf(page, 0);
		await page.mouse.move(first.x, first.y);
		await page.mouse.down();
		await page.mouse.move(first.x + 30, first.y + 10, { steps: 8 });
		await page.mouse.move(first.x, first.y, { steps: 8 });
		await page.mouse.up();
		await page.waitForTimeout(500);

		expect(await mediaOrder(page)).toEqual(before);
		await expect(
			page.getByRole("button", { name: "Save changes" }),
			"a no-op drag leaves nothing to save",
		).toBeHidden();
	});

	test("the tile controls still work right after a drag", async ({
		page,
	}) => {
		await openSharedAlbum(page);

		const first = await centerOf(page, 0);
		const second = await centerOf(page, 1);
		await page.mouse.move(first.x, first.y);
		await page.mouse.down();
		await page.mouse.move(second.x, second.y, { steps: 12 });
		await page.mouse.up();
		await page.waitForTimeout(500);

		await page
			.getByRole("button", { name: /^Remove album photo in slot 1$/ })
			.click();
		await expect(
			page.getByRole("button", { name: /^Keep album photo in slot 1$/ }),
			"the pointer capture did not swallow the next tap",
		).toBeVisible();
	});

	test("a tile can be carried to the last slot", async ({ page }) => {
		await openSharedAlbum(page);
		const before = await mediaOrder(page);

		const first = await centerOf(page, 0);
		const last = await centerOf(page, before.length - 1);
		await page.mouse.move(first.x, first.y);
		await page.mouse.down();
		await page.mouse.move(last.x, last.y, { steps: 14 });
		await page.mouse.up();
		await page.waitForTimeout(500);

		expect(await mediaOrder(page)).toEqual([...before.slice(1), before[0]]);
	});

	test("profile photos reorder without a save round trip", async ({
		page,
	}) => {
		await installTauriShim(page);
		await serveImages(page, CHAT_MEDIA_HOST);
		await page.goto("/settings/profile");
		await page.locator(CELL).first().waitFor({ timeout: 60_000 });
		await page.waitForTimeout(600);

		const before = await mediaOrder(page);
		expect(before.length).toBeGreaterThan(1);

		const second = await centerOf(page, 1);
		const first = await centerOf(page, 0);
		await page.mouse.move(second.x, second.y);
		await page.mouse.down();
		await page.mouse.move(first.x, first.y, { steps: 12 });
		await page.mouse.up();
		await page.waitForTimeout(400);

		const after = await mediaOrder(page);
		expect(after[0], "the dragged photo leads now").toBe(before[1]);
		expect(after[1]).toBe(before[0]);
	});
});
