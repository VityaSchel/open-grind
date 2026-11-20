import { expect, type Page, test } from "@playwright/test";

import { installTauriShim, openGrid, pathname } from "./support/app";
import { arrowThrough, focusProblems } from "./support/focus";
import { refreshButton } from "./support/pull";

const GRID = '[data-slot="grid-cells"]';
const CELL = `${GRID} > [role="row"] > [role="gridcell"]`;
const TAB_STOP = `${CELL} > [tabindex="0"]`;
const FIRST_CARD = `${CELL} > a[href^="/profile/"]`;
const PAGING_SKELETON = `${GRID} > div > div:not([role]) > div`;
const WALKED_CARDS = 12;
const PAGES_TO_LOAD = 3;
const TAB_LIMIT = 60;

type Region = "header" | "grid" | "nav" | "other";
type Cell = { row: number; column: number; columns: number };
type GridShape = { count: number; columns: number; complete: boolean };

test.use({ viewport: { width: 1280, height: 800 }, hasTouch: false });
test.describe.configure({ timeout: 240_000 });

test.beforeEach(async ({ page }) => {
	await installTauriShim(page, { platform: "macos" });
	await openGrid(page);
	await page.locator(FIRST_CARD).first().waitFor({ timeout: 60_000 });
});

function focusedRegion(page: Page): Promise<Region | null> {
	return page.evaluate(() => {
		const focused = document.activeElement;
		if (!focused || focused === document.body) return null;
		if (focused.closest("[data-fixed-header]")) return "header";
		if (focused.closest('[data-slot="grid-cells"]')) return "grid";
		if (focused.closest("nav")) return "nav";
		return "other";
	});
}

async function tabRegions(page: Page): Promise<Region[]> {
	await page.evaluate(() =>
		(document.activeElement as HTMLElement | null)?.blur(),
	);
	const regions: Region[] = [];
	for (let i = 0; i < TAB_LIMIT; i++) {
		await page.keyboard.press("Tab");
		const region = await focusedRegion(page);
		if (region === null) break;
		regions.push(region);
		if (region === "nav") break;
	}
	return regions;
}

function focusedCell(page: Page): Promise<Cell | null> {
	return page.locator(GRID).evaluate((grid) => {
		const focused = document.activeElement;
		const cell = focused?.parentElement;
		if (
			!focused ||
			cell?.getAttribute("role") !== "gridcell" ||
			cell.parentElement?.parentElement !== grid
		)
			return null;
		const style = getComputedStyle(grid);
		const tracks = style.gridTemplateColumns.trim().split(/\s+/);
		const cellPx = Number.parseFloat(tracks[0]!);
		const gridBox = grid.getBoundingClientRect();
		const box = focused.getBoundingClientRect();
		return {
			row: Math.round(
				(box.top - gridBox.top) /
					(cellPx + Number.parseFloat(style.rowGap)),
			),
			column: Math.round(
				(box.left - gridBox.left) /
					(cellPx + Number.parseFloat(style.columnGap)),
			),
			columns: tracks.length,
		};
	});
}

function focusedInsideBand(page: Page): Promise<boolean> {
	return page.evaluate(() => {
		const focused = document.activeElement;
		let scroller = focused?.parentElement ?? null;
		while (
			scroller &&
			!/auto|scroll/.test(getComputedStyle(scroller).overflowY)
		)
			scroller = scroller.parentElement;
		if (!focused || !scroller) return false;
		const view = scroller.getBoundingClientRect();
		const style = getComputedStyle(scroller);
		const box = focused.getBoundingClientRect();
		return (
			box.top >=
				view.top + Number.parseFloat(style.scrollPaddingTop) - 1 &&
			box.bottom <=
				view.bottom - Number.parseFloat(style.scrollPaddingBottom) + 1
		);
	});
}

function rowsPerBand(page: Page): Promise<number> {
	return page.locator(GRID).evaluate((grid) => {
		let scroller = grid.parentElement;
		while (
			scroller &&
			!/auto|scroll/.test(getComputedStyle(scroller).overflowY)
		)
			scroller = scroller.parentElement;
		const style = getComputedStyle(scroller!);
		const band =
			scroller!.clientHeight -
			Number.parseFloat(style.scrollPaddingTop) -
			Number.parseFloat(style.scrollPaddingBottom);
		const gridStyle = getComputedStyle(grid);
		const cellPx = Number.parseFloat(
			gridStyle.gridTemplateColumns.trim().split(/\s+/)[0]!,
		);
		return Math.floor(
			band / (cellPx + Number.parseFloat(gridStyle.rowGap)),
		);
	});
}

function scrollGridTo(page: Page, edge: "start" | "end"): Promise<number> {
	return page.locator(GRID).evaluate((grid, to) => {
		let scroller = grid.parentElement;
		while (
			scroller &&
			!/auto|scroll/.test(getComputedStyle(scroller).overflowY)
		)
			scroller = scroller.parentElement;
		scroller!.scrollTo({ top: to === "end" ? scroller!.scrollHeight : 0 });
		return scroller!.scrollHeight;
	}, edge);
}

function gridShape(page: Page): Promise<GridShape> {
	return page
		.locator(GRID)
		.evaluate((grid) => ({
			count: grid.querySelectorAll(
				':scope > [role="row"] > [role="gridcell"] > a[href^="/profile/"]',
			).length,
			columns: getComputedStyle(grid)
				.gridTemplateColumns.trim()
				.split(/\s+/).length,
			complete:
				!grid.hasAttribute("data-rows-above") &&
				!grid.hasAttribute("data-rows-below"),
		}));
}

function drawnRows(page: Page) {
	return page.locator(GRID).evaluate((grid) => {
		const columns = getComputedStyle(grid)
			.gridTemplateColumns.trim()
			.split(/\s+/).length;
		const rows = [...grid.querySelectorAll(':scope > [role="row"]')];
		const cardsOf = (row: Element) => [
			...row.querySelectorAll(':scope > [role="gridcell"] > *'),
		];
		const indexes = rows.map((row) =>
			Number(row.getAttribute("aria-rowindex")),
		);
		return {
			outsideCells: [
				...grid.querySelectorAll('a[href^="/profile/"]'),
			].filter(
				(card) =>
					card.parentElement?.getAttribute("role") !== "gridcell" ||
					card.parentElement.parentElement?.getAttribute("role") !==
						"row",
			).length,
			mixedRows: rows.filter(
				(row) =>
					new Set(
						cardsOf(row).map((card) =>
							Math.round(card.getBoundingClientRect().top),
						),
					).size !== 1,
			).length,
			shortRowsBeforeLast: rows
				.slice(0, -1)
				.filter((row) => cardsOf(row).length !== columns).length,
			indexGaps: indexes.filter(
				(index, at) => at > 0 && index !== indexes[at - 1]! + 1,
			).length,
		};
	});
}

function gridHeight(page: Page): Promise<number> {
	return page
		.locator(GRID)
		.evaluate((grid) => grid.getBoundingClientRect().height);
}

function tabStopIsFirstVisibleCard(page: Page): Promise<boolean> {
	return page.locator(GRID).evaluate((grid) => {
		let scroller = grid.parentElement;
		while (
			scroller &&
			!/auto|scroll/.test(getComputedStyle(scroller).overflowY)
		)
			scroller = scroller.parentElement;
		const view = scroller!.getBoundingClientRect();
		const style = getComputedStyle(scroller!);
		const top = view.top + Number.parseFloat(style.scrollPaddingTop);
		const bottom =
			view.bottom - Number.parseFloat(style.scrollPaddingBottom);
		const cards = grid.querySelectorAll(
			':scope > [role="row"] > [role="gridcell"] > *',
		);
		const firstVisible = [...cards].find((card) => {
			const box = card.getBoundingClientRect();
			return box.top >= top - 0.5 && box.bottom <= bottom + 0.5;
		});
		return (
			firstVisible !== undefined &&
			firstVisible.getAttribute("tabindex") === "0"
		);
	});
}

function gridScrollTop(page: Page): Promise<number> {
	return page.locator(GRID).evaluate((grid) => {
		let scroller = grid.parentElement;
		while (
			scroller &&
			!/auto|scroll/.test(getComputedStyle(scroller).overflowY)
		)
			scroller = scroller.parentElement;
		return scroller?.scrollTop ?? 0;
	});
}

async function waitForScrollToSettle(page: Page): Promise<void> {
	let previous = Number.NaN;
	await expect
		.poll(
			async () => {
				const top = await gridScrollTop(page);
				const settled = top === previous;
				previous = top;
				return settled;
			},
			{ intervals: [250] },
		)
		.toBe(true);
}

async function loadMorePages(page: Page): Promise<void> {
	for (let loaded = 0; loaded < PAGES_TO_LOAD; loaded++) {
		const height = await scrollGridTo(page, "end");
		await expect
			.poll(() => scrollGridTo(page, "end"))
			.toBeGreaterThan(height);
	}
	await scrollGridTo(page, "start");
	await expect(page.locator(GRID)).not.toHaveAttribute("data-rows-above");
	await expect(page.locator(GRID)).toHaveAttribute("data-rows-below", "true");
}

async function tabIntoGrid(page: Page): Promise<void> {
	await page.evaluate(() =>
		(document.activeElement as HTMLElement | null)?.blur(),
	);
	for (let i = 0; i < TAB_LIMIT; i++) {
		await page.keyboard.press("Tab");
		if ((await focusedRegion(page)) === "grid") return;
	}
	throw new Error("Tab never reached the grid");
}

async function focusFirstCard(page: Page): Promise<void> {
	await page.locator(FIRST_CARD).first().focus();
	await expect
		.poll(() => focusedCell(page))
		.toMatchObject({ row: 0, column: 0 });
}

test.describe("the browse grid from the keyboard", () => {
	test("is one Tab stop between the filter chips and the NavBar", async ({
		page,
	}) => {
		const regions = await tabRegions(page);
		const grid = regions.indexOf("grid");

		expect(regions.filter((region) => region === "grid")).toHaveLength(1);
		expect(regions.lastIndexOf("header")).toBeLessThan(grid);
		expect(regions.at(-1)).toBe("nav");
		expect(regions.slice(grid + 1, -1)).toEqual([]);
	});

	test("walks along and down the cards with a visible, unclipped ring", async ({
		page,
	}) => {
		const along = await arrowThrough(page, {
			start: page.locator(TAB_STOP),
			key: "ArrowRight",
			stops: WALKED_CARDS,
		});
		const down = await arrowThrough(page, {
			key: "ArrowDown",
			stops: WALKED_CARDS,
		});

		expect(along).toHaveLength(WALKED_CARDS);
		expect(down).toHaveLength(WALKED_CARDS);
		expect(focusProblems([...along, ...down])).toEqual([]);
	});

	test("continues on the next row past a row end, and Up and Down keep the column", async ({
		page,
	}) => {
		await focusFirstCard(page);
		const { columns } = (await focusedCell(page))!;

		await page.keyboard.press("End");
		expect(await focusedCell(page)).toMatchObject({
			row: 0,
			column: columns - 1,
		});
		await page.keyboard.press("ArrowRight");
		expect(await focusedCell(page)).toMatchObject({ row: 1, column: 0 });
		await page.keyboard.press("ArrowLeft");
		expect(await focusedCell(page)).toMatchObject({
			row: 0,
			column: columns - 1,
		});
		await page.keyboard.press("ArrowDown");
		await page.keyboard.press("ArrowDown");
		expect(await focusedCell(page)).toMatchObject({
			row: 2,
			column: columns - 1,
		});
		await page.keyboard.press("Home");
		expect(await focusedCell(page)).toMatchObject({ row: 2, column: 0 });
		await page.keyboard.press("ArrowUp");
		expect(await focusedCell(page)).toMatchObject({ row: 1, column: 0 });
	});

	test("leaves Up on the first row and Left on the first card to the page", async ({
		page,
	}) => {
		await focusFirstCard(page);
		const prevented = await page.evaluateHandle(() => {
			const seen: boolean[] = [];
			window.addEventListener("keydown", (event) => {
				setTimeout(() => seen.push(event.defaultPrevented));
			});
			return seen;
		});
		await page.keyboard.press("ArrowUp");
		await page.keyboard.press("ArrowLeft");

		await expect
			.poll(() => prevented.evaluate((seen) => [...seen]))
			.toEqual([false, false]);
		expect(await focusedCell(page)).toMatchObject({ row: 0, column: 0 });
	});

	test("pages by the rows that fit between the header and the NavBar", async ({
		page,
	}) => {
		await focusFirstCard(page);
		const rows = await rowsPerBand(page);

		await page.keyboard.press("PageDown");
		await expect
			.poll(() => focusedCell(page))
			.toMatchObject({ row: rows, column: 0 });
		await expect.poll(() => focusedInsideBand(page)).toBe(true);

		await page.keyboard.press("PageUp");
		await expect
			.poll(() => focusedCell(page))
			.toMatchObject({ row: 0, column: 0 });
	});

	test("reaches the last loaded card and keeps it in view although it was never rendered", async ({
		page,
	}) => {
		await loadMorePages(page);
		const unrenderedRow = await page.locator(GRID).evaluate((grid) => {
			const style = getComputedStyle(grid);
			const stride =
				Number.parseFloat(style.gridTemplateColumns) +
				Number.parseFloat(style.rowGap);
			return Math.ceil(
				(grid.getBoundingClientRect().height -
					Number.parseFloat(style.paddingBottom)) /
					stride,
			);
		});
		await focusFirstCard(page);
		await page.keyboard.press("Control+End");

		await expect
			.poll(async () => (await focusedCell(page))?.row ?? 0)
			.toBeGreaterThanOrEqual(unrenderedRow);
		await expect.poll(() => focusedInsideBand(page)).toBe(true);
		expect(
			focusProblems(
				await arrowThrough(page, { key: "ArrowLeft", stops: 3 }),
			),
		).toEqual([]);

		await page.keyboard.press("Control+Home");
		await expect
			.poll(() => focusedCell(page))
			.toMatchObject({ row: 0, column: 0 });
		await expect.poll(() => focusedInsideBand(page)).toBe(true);
	});

	test("moves the Tab stop to the first fully visible card after a wheel scroll", async ({
		page,
	}) => {
		const grid = page.locator(GRID);
		await grid.hover();
		await page.mouse.wheel(0, 1800);
		await waitForScrollToSettle(page);

		await expect.poll(() => tabStopIsFirstVisibleCard(page)).toBe(true);
		const stop = await page.locator(TAB_STOP).getAttribute("href");
		await tabIntoGrid(page);
		await expect(page.locator(TAB_STOP)).toBeFocused();
		expect(await page.locator(TAB_STOP).getAttribute("href")).toBe(stop);
		expect(await focusedInsideBand(page)).toBe(true);
	});

	test("hands the Tab stop on from a card focused earlier once a wheel scroll hides it", async ({
		page,
	}) => {
		await focusFirstCard(page);
		const focusedEarlier = await page.evaluate(() =>
			document.activeElement?.getAttribute("href"),
		);
		await page.keyboard.press("Shift+Tab");
		await page.locator(GRID).hover();
		await page.mouse.wheel(0, 450);
		await waitForScrollToSettle(page);

		await expect
			.poll(() => page.locator(TAB_STOP).getAttribute("href"))
			.not.toBe(focusedEarlier);
		await expect.poll(() => tabStopIsFirstVisibleCard(page)).toBe(true);
		const stop = await page.locator(TAB_STOP).getAttribute("href");
		await tabIntoGrid(page);
		await expect(page.locator(TAB_STOP)).toBeFocused();
		expect(await page.locator(TAB_STOP).getAttribute("href")).toBe(stop);
		expect(await focusedInsideBand(page)).toBe(true);
	});

	test("puts focus back on the profile the pager ended on after Back", async ({
		page,
	}) => {
		await focusFirstCard(page);
		await page.keyboard.press("ArrowRight");
		await page.keyboard.press("Enter");
		await expect.poll(() => pathname(page)).toMatch(/^\/profile\/\d+$/);
		const opened = await pathname(page);
		await page.keyboard.press("ArrowRight");
		await expect.poll(() => pathname(page)).not.toBe(opened);
		const landed = await pathname(page);

		await page.goBack();
		await expect(
			page.locator(`${CELL} > a[href="${landed}"]`),
		).toBeFocused();
		await expect(page.locator(TAB_STOP)).toHaveAttribute("href", landed);
		expect(await focusedInsideBand(page)).toBe(true);
	});

	test("puts focus back on the opened card after Escape goes back", async ({
		page,
	}) => {
		await focusFirstCard(page);
		await page.keyboard.press("ArrowDown");
		const card = await page.evaluate(() =>
			document.activeElement?.getAttribute("href"),
		);
		await page.keyboard.press("Enter");
		await expect.poll(() => pathname(page)).toBe(card);

		await page.keyboard.press("Escape");
		await expect(page.locator(`${CELL} > a[href="${card}"]`)).toBeFocused();
		await expect(page.locator(TAB_STOP)).toHaveAttribute("href", card!);
	});

	test("leaves focus where Back puts it when the profile was opened with a pointer", async ({
		page,
	}) => {
		const card = page.locator(FIRST_CARD).nth(2);
		const href = await card.getAttribute("href");
		await card.click();
		await expect.poll(() => pathname(page)).toBe(href);

		await page.goBack();
		await expect(page.locator(TAB_STOP)).toHaveAttribute("href", href!);
		expect(await focusedRegion(page)).not.toBe("grid");
	});

	test("lands on the last card when Down leaves the row above a shorter last row", async ({
		page,
	}) => {
		await page
			.getByRole("button", { name: "Right Now", exact: true })
			.click();
		await expect
			.poll(async () => {
				const shape = await gridShape(page);
				return shape.complete ? shape.count % shape.columns : 0;
			})
			.toBeGreaterThan(0);
		const { count, columns } = await gridShape(page);
		const cards = page.locator(FIRST_CARD);
		await cards.nth((Math.ceil(count / columns) - 1) * columns - 1).focus();

		await page.keyboard.press("ArrowDown");

		await expect(cards.last()).toBeFocused();
	});

	test("loads the next page once Ctrl+End reaches the last loaded card", async ({
		page,
	}) => {
		const firstPageHeight = await gridHeight(page);
		await focusFirstCard(page);

		await page.keyboard.press("Control+End");
		await expect.poll(() => focusedInsideBand(page)).toBe(true);
		const lastLoaded = (await focusedCell(page))!;
		await expect
			.poll(() => gridHeight(page))
			.toBeGreaterThan(firstPageHeight);
		await expect(page.locator(PAGING_SKELETON)).toHaveCount(0);

		await page.keyboard.press("ArrowDown");
		await expect
			.poll(() => focusedCell(page))
			.toMatchObject({
				row: lastLoaded.row + 1,
				column: lastLoaded.column,
			});
		await expect.poll(() => focusedInsideBand(page)).toBe(true);
	});

	test("offers Refresh when Up leaves the first row, one Shift+Tab away", async ({
		page,
	}) => {
		await focusFirstCard(page);

		await page.keyboard.press("ArrowUp");
		await expect(refreshButton(page)).toBeVisible();
		await page.keyboard.press("Shift+Tab");

		await expect(refreshButton(page)).toBeFocused();
	});

	test("is a grid named Browse whose rows hold one drawn row of cards each, at any width", async ({
		page,
	}) => {
		const grid = page.getByRole("grid", { name: "Browse" });
		await expect(grid).toBeVisible();
		for (const width of [1280, 700]) {
			await page.setViewportSize({ width, height: 800 });
			await expect
				.poll(() => drawnRows(page), { timeout: 10_000 })
				.toMatchObject({
					outsideCells: 0,
					mixedRows: 0,
					shortRowsBeforeLast: 0,
					indexGaps: 0,
				});
		}
	});

	test("Scroll to top from the keyboard puts focus on the first card", async ({
		page,
	}) => {
		await page.locator(GRID).hover();
		await page.mouse.wheel(0, 2400);
		const jump = page.getByRole("button", { name: "Scroll to top" });
		await jump.focus();
		await page.keyboard.press("Enter");

		await expect
			.poll(() => focusedCell(page))
			.toMatchObject({ row: 0, column: 0 });
		await expect(jump).toBeHidden();
		expect(
			focusProblems(
				await arrowThrough(page, { key: "ArrowRight", stops: 1 }),
			),
		).toEqual([]);
	});
});
