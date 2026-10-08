import { expect, type Page } from "@playwright/test";

import { MEDIA_SLOT_CELL } from "./albums";

const MEDIA_SLOT_GRID = '[data-slot="media-slot-grid"]';

export type Point = { x: number; y: number };

async function cellCenter({ page, index }: { page: Page; index: number }) {
	const box = await page.locator(MEDIA_SLOT_CELL).nth(index).boundingBox();
	expect(box, `cell ${index} is laid out`).not.toBeNull();
	return { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 };
}

function displacedTranslations(page: Page): Promise<number[]> {
	return page
		.locator(`${MEDIA_SLOT_CELL}:not([data-dragging])`)
		.evaluateAll((cells) =>
			cells.flatMap((cell) => {
				const match = /translate\((.+)px, (.+)px\)/.exec(
					(cell as HTMLElement).style.transform,
				);
				return match ? [Number(match[1]), Number(match[2])] : [];
			}),
		);
}

export async function expectPreviewOnDevicePixels({
	page,
	from,
	to,
}: {
	page: Page;
	from: number;
	to: number;
}) {
	const start = await cellCenter({ page, index: from });
	const end = await cellCenter({ page, index: to });
	await page.mouse.move(start.x, start.y);
	await page.mouse.down();
	await page.mouse.move(end.x, end.y, { steps: 12 });
	const translations = await displacedTranslations(page);
	await page.mouse.up();

	const devicePixelRatio = await page.evaluate(() => window.devicePixelRatio);
	expect(
		translations.some((length) => length !== 0),
		"the held photo pushed others aside",
	).toBe(true);
	const offGrid = translations.map((length) => {
		const devicePixels = length * devicePixelRatio;
		return Math.abs(devicePixels - Math.round(devicePixels));
	});
	expect(
		Math.max(...offGrid),
		`photos pushed aside sit on whole device pixels: ${translations.join(", ")}`,
	).toBeLessThan(0.01);
}

export function gridCorner(page: Page): Promise<Point> {
	return page.locator(MEDIA_SLOT_GRID).evaluate((grid) => {
		const { left, top } = grid.getBoundingClientRect();
		return { x: left, y: top };
	});
}

export function cellCentersInGrid(page: Page): Promise<Point[]> {
	return page.locator(MEDIA_SLOT_GRID).evaluate((grid, cell) => {
		const corner = grid.getBoundingClientRect();
		return [...grid.querySelectorAll(cell)].map((node) => {
			const box = node.getBoundingClientRect();
			return {
				x: box.left + box.width / 2 - corner.left,
				y: box.top + box.height / 2 - corner.top,
			};
		});
	}, MEDIA_SLOT_CELL);
}

export async function gridCornerOnceScrolled({
	page,
	from,
}: {
	page: Page;
	from: Point;
}): Promise<Point> {
	await expect
		.poll(async () => (await gridCorner(page)).y, {
			message: "the page scrolled under the held photo",
		})
		.toBeLessThan(from.y - 1);
	let previous = await gridCorner(page);
	await expect
		.poll(async () => {
			const current = await gridCorner(page);
			const still = current.y === previous.y;
			previous = current;
			return still;
		})
		.toBe(true);
	return previous;
}

export async function heldPhotoCenter(page: Page): Promise<Point> {
	const box = await page
		.locator(`${MEDIA_SLOT_CELL}[data-dragging]`)
		.boundingBox();
	expect(box, "a photo is held").not.toBeNull();
	return { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 };
}
