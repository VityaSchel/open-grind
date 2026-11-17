import type { Page } from "@playwright/test";

import { GRID_SCROLLER } from "./app";

export const GRID_CELLS = '[data-slot="grid-cells"]';
export const GRID_CELL = 'a[href^="/profile/"]';

export async function loadGridPages(
	page: Page,
	{ pages }: { pages: number },
): Promise<void> {
	const scroller = page.locator(GRID_SCROLLER);
	for (let loaded = 0; loaded < pages; loaded++) {
		await scroller.evaluate((element) =>
			element.scrollTo({ top: element.scrollHeight }),
		);
		await page.waitForTimeout(400);
	}
}

export async function scrollGridTo(
	page: Page,
	{ top }: { top: number },
): Promise<void> {
	await page
		.locator(GRID_SCROLLER)
		.evaluate((element, offset) => element.scrollTo({ top: offset }), top);
	await page.waitForTimeout(600);
}

export function measureGridWindow(page: Page) {
	return page.locator(GRID_CELLS).evaluate(
		(grid, { scrollerSelector, cellSelector }) => {
			const scroller = document.querySelector(scrollerSelector)!;
			const style = getComputedStyle(grid);
			const tracks = style.gridTemplateColumns.trim().split(/\s+/);
			const stride =
				Number.parseFloat(tracks[0]!) + Number.parseFloat(style.rowGap);
			const gridTop = grid.getBoundingClientRect().top;
			const view = scroller.getBoundingClientRect();

			const rows = new Set<number>();
			let offGrid = 0;
			const cells = [...grid.querySelectorAll(cellSelector)];
			for (const cell of cells) {
				const top = cell.getBoundingClientRect().top - gridTop;
				const row = Math.round(top / stride);
				rows.add(row);
				if (Math.abs(row * stride - top) > 1) offGrid++;
			}
			const ordered = [...rows].sort((a, b) => a - b);
			const holes = ordered.filter(
				(row, i) => i > 0 && row - ordered[i - 1]! !== 1,
			);

			return {
				cells: cells.length,
				gridHeight: grid.getBoundingClientRect().height,
				columns: tracks.length,
				offGrid,
				holes: holes.length,
				coversTop:
					ordered.length > 0 &&
					gridTop + ordered[0]! * stride <= view.top,
				coversBottom:
					ordered.length > 0 &&
					gridTop + (ordered.at(-1)! + 1) * stride >= view.bottom,
				rowsAbove: grid.hasAttribute("data-rows-above"),
				rowsBelow: grid.hasAttribute("data-rows-below"),
				topLeftRadius: getComputedStyle(grid.firstElementChild!)
					.borderTopLeftRadius,
				radiusBottom: style
					.getPropertyValue("--grid-radius-bottom")
					.trim(),
			};
		},
		{ scrollerSelector: GRID_SCROLLER, cellSelector: GRID_CELL },
	);
}
