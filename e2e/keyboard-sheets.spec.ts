import { expect, type Locator, type Page, test } from "@playwright/test";

import { ALBUM_TILE, openAlbums, SHARED_ALBUM } from "./support/albums";
import { DRAWER, MEDIA_TILE, openAttachments } from "./support/drawer";
import { arrowThrough, focusProblems, type FocusStop } from "./support/focus";
import { CHAT_MEDIA_HOST, serveImages } from "./support/media";
import {
	gaymojiPanel,
	gaymojiRegion,
	gaymojiSectionStrip,
	gaymojiTiles,
	gifSearchBox,
	gifTiles,
	openGaymoji,
	openStickers,
	STICKER_TILE,
	stickersTab,
} from "./support/stickers";

const ADD_TILE = '[data-slot="add-tile"]';
const MEDIA_GRID = '[data-slot="media-grid"]';
const GRID_CELLS = `${ADD_TILE}, ${ALBUM_TILE}, ${MEDIA_TILE}, ${STICKER_TILE}`;

test.describe.configure({ timeout: 240_000 });

function tabStops(composite: Locator): Locator {
	return composite.locator(`:is(${GRID_CELLS}, button)[tabindex="0"]`);
}

function focusedInside(composite: Locator): Promise<boolean> {
	return composite.evaluate((node) => node.contains(document.activeElement));
}

function focusedIndex(cells: Locator): Promise<number> {
	return cells.evaluateAll((elements) =>
		elements.indexOf(document.activeElement as HTMLElement),
	);
}

function columnsOf(cells: Locator): Promise<number> {
	return cells.evaluateAll((elements) => {
		const firstTop = Math.round(elements[0]!.getBoundingClientRect().top);
		return elements.filter(
			(element) =>
				Math.round(element.getBoundingClientRect().top) === firstTop,
		).length;
	});
}

async function expectOneTabStop({
	page,
	composite,
	start,
}: {
	page: Page;
	composite: Locator;
	start: Locator;
}): Promise<void> {
	await expect(tabStops(composite)).toHaveCount(1);
	await start.focus();
	await page.keyboard.press("Tab");
	expect(await focusedInside(composite), "Tab leaves the composite").toBe(
		false,
	);
	await page.keyboard.press("Shift+Tab");
	await expect(start).toBeFocused();
}

function expectCleanWalk({
	walk,
	length,
}: {
	walk: FocusStop[];
	length: number;
}): void {
	expect(focusProblems(walk)).toEqual([]);
	expect(walk, "every press moved focus to a new cell").toHaveLength(length);
}

test.describe("My Albums", () => {
	test("the album grid is one Tab stop and the arrows walk every tile with a visible ring", async ({
		page,
	}) => {
		await openAlbums(page);
		const grid = page.locator(MEDIA_GRID);
		const cells = grid.locator(`${ADD_TILE}, ${ALBUM_TILE}`);
		await expectOneTabStop({ page, composite: grid, start: cells.first() });

		const count = await cells.count();
		const walk = await arrowThrough(page, {
			start: cells.first(),
			key: "ArrowRight",
			stops: count + 1,
		});
		expectCleanWalk({ walk, length: count });
		await expect(cells.last()).toBeFocused();
		await page.keyboard.press("Control+Home");
		await expect(cells.first()).toBeFocused();
		await page.keyboard.press("Control+End");
		await expect(cells.last()).toBeFocused();
	});

	test("ArrowDown keeps the column and Enter then Back returns to the opened album", async ({
		page,
	}) => {
		await openAlbums(page);
		const cells = page.locator(
			`${MEDIA_GRID} :is(${ADD_TILE}, ${ALBUM_TILE})`,
		);
		const columns = await columnsOf(cells);
		await cells.first().focus();
		await page.keyboard.press("ArrowDown");
		await expect(cells.nth(columns)).toBeFocused();

		const shared = page.locator(SHARED_ALBUM);
		await shared.focus();
		await page.keyboard.press("Enter");
		await expect(page).toHaveURL(/\/albums\/\d+$/);
		await page.goBack();
		await expect(page).toHaveURL(/\/albums$/);
		await expect(shared).toBeFocused();
	});
});

test.describe("the attachments sheet", () => {
	test.beforeEach(async ({ page }) => {
		await serveImages(page, CHAT_MEDIA_HOST);
		await openAttachments(page);
	});

	test("the media grid is one Tab stop led by the add tile, and the arrows walk it by rows", async ({
		page,
	}) => {
		const panel = page.getByRole("tabpanel", { name: "Media" });
		const cells = panel.locator(`${ADD_TILE}, ${MEDIA_TILE}`);
		await cells.nth(1).waitFor();
		await expectOneTabStop({
			page,
			composite: panel,
			start: cells.first(),
		});

		const walk = await arrowThrough(page, {
			start: cells.first(),
			key: "ArrowRight",
			stops: 8,
		});
		expectCleanWalk({ walk, length: 8 });

		const columns = await columnsOf(cells);
		await cells.first().focus();
		await page.keyboard.press("ArrowDown");
		await expect(cells.nth(columns)).toBeFocused();
		await page.keyboard.press("ArrowUp");
		await expect(cells.first()).toBeFocused();
	});

	test("Home and End stay on the row, Control reaches the ends, and the page keys keep the column", async ({
		page,
	}) => {
		const panel = page.getByRole("tabpanel", { name: "Media" });
		const cells = panel.locator(`${ADD_TILE}, ${MEDIA_TILE}`);
		await cells.nth(1).waitFor();
		const columns = await columnsOf(cells);
		const count = await cells.count();
		expect(
			count,
			"the demo drawer fills more than one row",
		).toBeGreaterThan(columns);

		await cells.first().focus();
		await page.keyboard.press("End");
		await expect(cells.nth(columns - 1)).toBeFocused();
		await page.keyboard.press("Home");
		await expect(cells.first()).toBeFocused();
		await page.keyboard.press("Control+End");
		await expect(cells.last()).toBeFocused();
		await page.keyboard.press("Control+Home");
		await expect(cells.first()).toBeFocused();

		await page.keyboard.press("PageDown");
		await expect
			.poll(
				() => focusedIndex(cells),
				"PageDown moves down a row or more",
			)
			.toBeGreaterThanOrEqual(columns);
		expect((await focusedIndex(cells)) % columns, "same column").toBe(0);
		await page.keyboard.press("PageUp");
		await expect(cells.first()).toBeFocused();
	});

	test("the album grid keeps locked albums reachable without picking them", async ({
		page,
	}) => {
		await page.locator(DRAWER).getByRole("tab", { name: "Albums" }).click();
		const panel = page.getByRole("tabpanel", { name: "Albums" });
		const tiles = panel.locator(ALBUM_TILE);
		const locked = panel.locator(`${ALBUM_TILE}[aria-disabled="true"]`);
		await expect(locked).toHaveCount(1, { timeout: 30_000 });
		await expectOneTabStop({
			page,
			composite: panel,
			start: tiles.first(),
		});

		const count = await tiles.count();
		const walk = await arrowThrough(page, {
			start: tiles.first(),
			key: "ArrowRight",
			stops: count + 1,
		});
		expectCleanWalk({ walk, length: count });

		await locked.focus();
		await page.keyboard.press("Enter");
		await expect(locked).toHaveAttribute("aria-pressed", "false");
		await expect(locked).toBeFocused();
	});
});

test.describe("the GIF grid", () => {
	test.beforeEach(async ({ page }) => {
		await openStickers(page, { stretchPanel: false });
	});

	test("ArrowDown and Enter in the search move to the results, ArrowUp from the top row goes back", async ({
		page,
	}) => {
		const search = gifSearchBox(page);
		const first = gifTiles(page).first();
		await search.focus();
		await page.keyboard.press("ArrowDown");
		await expect(first).toBeFocused();
		await page.keyboard.press("ArrowUp");
		await expect(search).toBeFocused();
		await page.keyboard.press("Enter");
		await expect(first).toBeFocused();
	});

	test("the active result survives a switch to the gaymoji tab and back", async ({
		page,
	}) => {
		const tiles = gifTiles(page);
		await tiles.first().focus();
		for (let step = 0; step < 4; step++)
			await page.keyboard.press("ArrowRight");
		await expect(tiles.nth(4)).toBeFocused();

		await stickersTab(page, { name: "Gaymoji" }).click();
		await expect(gaymojiTiles(page).first()).toBeVisible();
		await stickersTab(page, { name: "GIFs" }).click();
		await expect(tiles.nth(4)).toHaveAttribute("tabindex", "0");
		await gifSearchBox(page).focus();
		await page.keyboard.press("Tab");
		await expect(tiles.nth(4)).toBeFocused();
	});

	test("the results are one Tab stop and the arrows walk them with a visible ring", async ({
		page,
	}) => {
		const grid = page.locator(
			`${DRAWER} [data-slot="gif-results"] [data-slot="sticker-grid"]`,
		);
		const tiles = gifTiles(page);
		await expectOneTabStop({ page, composite: grid, start: tiles.first() });

		const across = await arrowThrough(page, {
			start: tiles.first(),
			key: "ArrowRight",
			stops: 8,
		});
		expectCleanWalk({ walk: across, length: 8 });
		const down = await arrowThrough(page, {
			start: tiles.first(),
			key: "ArrowDown",
			stops: 6,
		});
		expectCleanWalk({ walk: down, length: 6 });
	});
});

test.describe("the GIF search on a touch screen", () => {
	test.use({ hasTouch: true });

	test.beforeEach(async ({ page }) => {
		await openStickers(page, { stretchPanel: false });
	});

	test("Enter after tapping the search dismisses it without moving focus to the results", async ({
		page,
	}) => {
		const search = gifSearchBox(page);
		await search.tap();
		await page.keyboard.type("cat");
		await page.keyboard.press("Enter");
		await expect(search).not.toBeFocused();
		await expect(gifTiles(page).first()).toHaveAccessibleName(/cat/i);
		const resultFocusedAfterLoad = await page.evaluate(
			(tile) =>
				new Promise<boolean>((resolve) => {
					requestAnimationFrame(() =>
						requestAnimationFrame(() =>
							resolve(
								document.activeElement?.matches(tile) ?? false,
							),
						),
					);
				}),
			STICKER_TILE,
		);
		expect(resultFocusedAfterLoad).toBe(false);
	});
});

test.describe("the gaymoji tab", () => {
	test.beforeEach(async ({ page }) => {
		await openGaymoji(page, { stretchPanel: false });
	});

	test("the section strip is one Tab stop whose arrows wrap around", async ({
		page,
	}) => {
		const strip = gaymojiSectionStrip(page);
		const buttons = strip.getByRole("button");
		await expectOneTabStop({
			page,
			composite: strip,
			start: buttons.first(),
		});

		const count = await buttons.count();
		const walk = await arrowThrough(page, {
			start: buttons.first(),
			key: "ArrowRight",
			stops: count + 1,
		});
		expectCleanWalk({ walk, length: count });
		await expect(buttons.first()).toBeFocused();
		await page.keyboard.press("ArrowLeft");
		await expect(buttons.last()).toBeFocused();
	});

	test("Enter on a section jumps there and Tab lands on its first gaymoji, not the one focused before", async ({
		page,
	}) => {
		const button = gaymojiSectionStrip(page).getByRole("button").nth(2);
		const title = await button.getAttribute("aria-label");
		const sectionTiles = gaymojiRegion(page, { title: title! }).locator(
			STICKER_TILE,
		);
		await button.focus();
		await page.keyboard.press("Enter");
		await expect(sectionTiles.first()).toHaveAttribute("tabindex", "0");
		await page.keyboard.press("Tab");
		await page.keyboard.press("ArrowRight");
		await expect(sectionTiles.nth(1)).toBeFocused();

		await page.keyboard.press("Shift+Tab");
		await expect(button).toBeFocused();
		await page.keyboard.press("Enter");
		await expect(sectionTiles.first()).toHaveAttribute("tabindex", "0");
		await page.keyboard.press("Tab");
		await expect(sectionTiles.first()).toBeFocused();
	});

	test("the arrows cross sections and unrendered rows with a visible ring", async ({
		page,
	}) => {
		await gaymojiSectionStrip(page).getByRole("button").first().focus();
		await page.keyboard.press("Tab");
		await expect(gaymojiTiles(page).first()).toBeFocused();
		const down = await arrowThrough(page, { key: "ArrowDown", stops: 40 });
		expectCleanWalk({ walk: down, length: 40 });

		const before = await page.evaluate(
			() => document.activeElement?.getAttribute("aria-label") ?? "",
		);
		await page.keyboard.press("PageDown");
		await expect
			.poll(() =>
				page.evaluate(() =>
					document.activeElement?.getAttribute("aria-label"),
				),
			)
			.not.toBe(before);
		expect(
			focusProblems(
				await arrowThrough(page, { key: "ArrowRight", stops: 3 }),
			),
		).toEqual([]);
	});

	test("a wheel scroll that unrenders the focused gaymoji keeps focus in the grid", async ({
		page,
	}) => {
		const sections = gaymojiPanel(page).locator(
			'[data-slot="gaymoji-sections"]',
		);
		const firstTile = gaymojiTiles(page).first();
		await firstTile.focus();
		const focusedTile = await firstTile.elementHandle();
		const box = (await sections.boundingBox())!;
		await page.mouse.move(box.x + box.width / 2, box.y + 200);
		for (let turn = 0; turn < 8; turn++) {
			await page.mouse.wheel(0, 800);
			await page.waitForTimeout(100);
		}
		await expect
			.poll(
				() => focusedTile!.evaluate((tile) => tile.isConnected),
				"the scroll unrendered the focused gaymoji",
			)
			.toBe(false);
		await expect
			.poll(() =>
				page.evaluate(
					(tile) =>
						document.activeElement?.matches(tile) &&
						document.activeElement.closest(
							'[data-slot="gaymoji-sections"]',
						) !== null,
					STICKER_TILE,
				),
			)
			.toBe(true);
	});
});
