import { expect, type Locator, type Page, test } from "@playwright/test";

import {
	MEDIA_SLOT_CELL as CELL,
	openAlbum,
	TWO_ROW_ALBUM,
} from "./support/albums";
import { installTauriShim } from "./support/app";
import { arrowThrough, focusProblems } from "./support/focus";
import { CHAT_MEDIA_HOST, serveImages } from "./support/media";

const ADD_TILE = '[data-slot="add-tile"]';
const GRID = '[data-slot="media-slot-grid"]';
const STATUS = '[data-slot="media-slot-grid-status"]';

test.describe.configure({ timeout: 120_000 });

function mediaOrder(page: Page): Promise<string[]> {
	return page
		.locator(`${CELL} img`)
		.evaluateAll((nodes) =>
			nodes.map((node) => node.getAttribute("src") ?? ""),
		);
}

function focusedCellIndex(page: Page): Promise<number> {
	return page
		.locator(CELL)
		.evaluateAll((cells) =>
			cells.findIndex((cell) => cell === document.activeElement),
		);
}

function focusedImage(page: Page): Promise<string | null> {
	return page.evaluate(
		() =>
			document.activeElement?.querySelector("img")?.getAttribute("src") ??
			null,
	);
}

function offsetInGrid(cell: Locator): Promise<{ x: number; y: number }> {
	return cell.evaluate((node) => {
		const grid = node.closest('[data-slot="media-slot-grid"]')!;
		const cellBox = node.getBoundingClientRect();
		const gridBox = grid.getBoundingClientRect();
		return { x: cellBox.x - gridBox.x, y: cellBox.y - gridBox.y };
	});
}

function announcement(page: Page): Locator {
	return page.locator(STATUS);
}

function gridTiles(page: Page): Locator {
	return page.locator(GRID).locator(`${ADD_TILE}, ${CELL}`);
}

async function focusSlot({ page, slot }: { page: Page; slot: number }) {
	await gridTiles(page).first().focus();
	for (let step = 0; step <= slot; step++) {
		if ((await focusedCellIndex(page)) === slot) break;
		await page.keyboard.press("ArrowRight");
	}
	expect(await focusedCellIndex(page)).toBe(slot);
}

async function openProfileEditor(page: Page) {
	await installTauriShim(page, { platform: "macos" });
	await serveImages(page, CHAT_MEDIA_HOST);
	await page.goto("/settings/profile");
	await page.locator(CELL).first().waitFor({ timeout: 60_000 });
	await page.waitForTimeout(600);
}

async function expectOneTabStop({
	page,
	grid,
	start,
}: {
	page: Page;
	grid: Locator;
	start: Locator;
}) {
	await expect(grid.locator('[tabindex="0"]')).toHaveCount(1);
	await start.focus();
	await page.keyboard.press("Tab");
	expect(
		await grid.evaluate((node) => node.contains(document.activeElement)),
		"Tab leaves the grid",
	).toBe(false);
	await page.keyboard.press("Shift+Tab");
	await expect(start).toBeFocused();
}

test.describe("keyboard reorder of album media", () => {
	test.beforeEach(async ({ page }) => {
		await openAlbum(page, { tile: TWO_ROW_ALBUM, platform: "macos" });
	});

	test("the media grid is one Tab stop and the arrows walk the add tile and every item with a visible ring", async ({
		page,
	}) => {
		const grid = page.locator(GRID);
		const tiles = gridTiles(page);
		await expect(tiles).toHaveCount(6);
		await expectOneTabStop({ page, grid, start: tiles.first() });

		const walk = await arrowThrough(page, {
			start: tiles.first(),
			key: "ArrowRight",
			stops: 8,
		});
		expect(focusProblems(walk)).toEqual([]);
		expect(
			walk,
			"Right crosses the row end into the next row",
		).toHaveLength(6);

		await tiles.first().focus();
		await page.keyboard.press("ArrowDown");
		expect(await focusedCellIndex(page), "Down keeps the column").toBe(2);
	});

	test("Space lifts an item, the arrows carry it and Space drops it where the preview showed", async ({
		page,
	}) => {
		const before = await mediaOrder(page);
		expect(before).toHaveLength(5);
		const target = await offsetInGrid(page.locator(CELL).nth(3));
		await focusSlot({ page, slot: 0 });

		await page.keyboard.press("Space");
		await expect(page.locator(CELL).first()).toHaveAttribute(
			"data-dragging",
			"",
		);
		await expect(announcement(page)).toHaveText("Picked up at 1 of 5");
		await page.keyboard.press("ArrowDown");
		await expect(announcement(page)).toHaveText("Moved to 4 of 5");
		await page.waitForTimeout(300);
		const held = await offsetInGrid(page.locator(CELL).first());
		expect(
			Math.abs(held.x - target.x) + Math.abs(held.y - target.y),
			"the held item sits over the slot it will drop into",
		).toBeLessThan(2);
		expect(await focusedCellIndex(page), "focus rides with the item").toBe(
			0,
		);

		await page.keyboard.press("Space");
		await expect(announcement(page)).toHaveText("Dropped at 4 of 5");
		expect(await mediaOrder(page)).toEqual([
			before[1],
			before[2],
			before[3],
			before[0],
			before[4],
		]);
		expect(
			await focusedCellIndex(page),
			"focus follows the dropped item",
		).toBe(3);
		expect(await focusedImage(page)).toBe(before[0]);
		await expect(page.locator(`${CELL}[data-dragging]`)).toHaveCount(0);
	});

	test("Escape puts a lifted item back and stays in the editor", async ({
		page,
	}) => {
		const before = await mediaOrder(page);
		const url = page.url();
		await focusSlot({ page, slot: 1 });

		await page.keyboard.press("Space");
		await page.keyboard.press("ArrowRight");
		await page.keyboard.press("Escape");

		await expect(announcement(page)).toHaveText("Move cancelled");
		await expect(page.locator(`${CELL}[data-dragging]`)).toHaveCount(0);
		expect(page.url(), "Escape did not go back").toBe(url);
		expect(await mediaOrder(page)).toEqual(before);
		expect(await focusedCellIndex(page)).toBe(1);
	});

	test("Tab away from a lifted item puts it back", async ({ page }) => {
		const before = await mediaOrder(page);
		await focusSlot({ page, slot: 0 });

		await page.keyboard.press("Space");
		await page.keyboard.press("ArrowRight");
		await expect(page.locator(CELL).first()).toHaveAttribute(
			"data-dragging",
			"",
		);
		await expect(announcement(page)).toHaveText("Moved to 2 of 5");
		await page.keyboard.press("Tab");

		await expect(page.locator(`${CELL}[data-dragging]`)).toHaveCount(0);
		expect(await mediaOrder(page)).toEqual(before);
	});

	test("Alt and Ctrl arrows leave a lifted item where it is", async ({
		page,
	}) => {
		await focusSlot({ page, slot: 0 });
		await page.keyboard.press("Space");

		for (const chord of ["Alt+ArrowRight", "Control+ArrowRight"])
			await page.keyboard.press(chord);

		await expect(announcement(page)).toHaveText("Picked up at 1 of 5");
		await page.keyboard.press("Escape");
	});

	test("Delete marks the focused item for removal and Backspace keeps it", async ({
		page,
	}) => {
		await focusSlot({ page, slot: 0 });
		const cell = page.locator(CELL).first();
		await expect(cell).toHaveAttribute(
			"aria-keyshortcuts",
			"Delete Backspace",
		);

		await page.keyboard.press("Delete");
		await expect(
			page.getByRole("button", { name: "Keep album photo in slot 1" }),
		).toBeAttached();
		await expect(cell).toHaveAttribute("aria-label", /marked for removal$/);

		await page.keyboard.press("Backspace");
		await expect(
			page.getByRole("button", { name: "Remove album photo in slot 1" }),
		).toBeAttached();
		await expect(cell).toBeFocused();
	});

	test("the add tile stays one stop of the grid and lets the arrows out while it is off", async ({
		page,
	}) => {
		const grid = page.locator(GRID);
		const add = grid.locator(ADD_TILE);
		const upload = page.getByRole("button", {
			name: "Upload photos or videos",
		});
		const chooser = page.waitForEvent("filechooser");
		await add.focus();
		await page.keyboard.press("Enter");
		await upload.first().click();
		await chooser;
		await expect(upload).toHaveCount(0);
		await expect(add, "the closed sheet hands focus back").toBeFocused();
		await expect(add).toHaveAttribute("aria-disabled", "true");

		await expect(grid.locator('[tabindex="0"]')).toHaveCount(1);
		await page.keyboard.press("ArrowRight");
		expect(await focusedCellIndex(page), "Right leaves the add tile").toBe(
			0,
		);
		await page.keyboard.press("ArrowLeft");
		await expect(add).toBeFocused();
		await page.keyboard.press("ArrowDown");
		expect(await focusedCellIndex(page), "Down leaves the add tile").toBe(
			2,
		);
		await expect(grid.locator('[tabindex="0"]')).toHaveCount(1);
		await expect(add).toHaveAttribute("tabindex", "-1");
	});
});

test.describe("keyboard reorder of profile photos", () => {
	test("the photo grid is one Tab stop and its arrows walk every tile with a visible ring", async ({
		page,
	}) => {
		await openProfileEditor(page);
		const grid = page.locator(GRID);
		const tiles = gridTiles(page);
		const count = await tiles.count();
		expect(count).toBeGreaterThan(1);
		await expectOneTabStop({ page, grid, start: tiles.first() });

		const walk = await arrowThrough(page, {
			start: tiles.first(),
			key: "ArrowRight",
			stops: count + 2,
		});
		expect(focusProblems(walk)).toEqual([]);
		expect(walk).toHaveLength(count);
	});

	test("a photo lifted by keyboard moves to the front and keeps focus", async ({
		page,
	}) => {
		await openProfileEditor(page);
		const before = await mediaOrder(page);
		expect(before.length).toBeGreaterThan(1);
		await focusSlot({ page, slot: 1 });

		await page.keyboard.press("Space");
		await page.keyboard.press("ArrowLeft");
		await page.keyboard.press("Enter");

		await expect
			.poll(async () => (await mediaOrder(page)).slice(0, 2), {
				message: "the lifted photo leads now",
			})
			.toEqual([before[1], before[0]]);
		expect(await focusedCellIndex(page)).toBe(0);
		expect(await focusedImage(page)).toBe(before[1]);
	});
});
