import { expect, type Page, test } from "@playwright/test";

import { ensureGridLocation, installTauriShim } from "./support/app";

const GRID = ".photo-grid";
const SCROLLER = ".pull-scroller";
const PROFILE_LINK = 'a[href^="/profile/"]';
const PAGES_TO_LOAD = 5;

async function openGrid(page: Page) {
	test.setTimeout(180_000);
	await installTauriShim(page);
	await page.goto("/");
	await page.locator("nav a").first().waitFor({ timeout: 120_000 });
	await ensureGridLocation(page);
	await page.locator(PROFILE_LINK).first().waitFor({ timeout: 60_000 });
}

function scrollTo(page: Page, top: number) {
	return page.evaluate(
		({ selector, offset }) => {
			document.querySelector(selector)!.scrollTo({ top: offset });
		},
		{ selector: SCROLLER, offset: top },
	);
}

async function loadPages(page: Page, pages: number) {
	for (let i = 0; i < pages; i++) {
		await page.evaluate((selector) => {
			const scroller = document.querySelector(selector)!;
			scroller.scrollTo({ top: scroller.scrollHeight });
		}, SCROLLER);
		await page.waitForTimeout(400);
	}
}

function measure(page: Page) {
	return page.evaluate(
		({ gridSelector, scrollerSelector }) => {
			const grid = document.querySelector(gridSelector) as HTMLElement;
			const scroller = document.querySelector(
				scrollerSelector,
			) as HTMLElement;
			const style = getComputedStyle(grid);
			const tracks = style.gridTemplateColumns.trim().split(/\s+/);
			const stride =
				Number.parseFloat(tracks[0]!) + Number.parseFloat(style.rowGap);
			const gridTop = grid.getBoundingClientRect().top;
			const view = scroller.getBoundingClientRect();

			const rows = new Set<number>();
			let offGrid = 0;
			const cells = [...grid.querySelectorAll("a[href^='/profile/']")];
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
				// Read off the grid, not a corner cell: the pagination sentinel
				// is the grid's last element child and shifts nth-child.
				radiusBottom: style
					.getPropertyValue("--grid-radius-bottom")
					.trim(),
			};
		},
		{ gridSelector: GRID, scrollerSelector: SCROLLER },
	);
}

test.describe("grid virtualization", () => {
	test("keeps the rendered cells to a window of a much taller grid", async ({
		page,
	}) => {
		await openGrid(page);
		await loadPages(page, PAGES_TO_LOAD);
		await scrollTo(page, 4000);
		await page.waitForTimeout(600);

		const view = await measure(page);

		expect(view.gridHeight).toBeGreaterThan(10_000);
		expect(view.cells).toBeLessThan(view.columns * 20);
		expect(view.coversTop && view.coversBottom).toBe(true);
	});

	test("lays the window out on the same rows a full grid would use", async ({
		page,
	}) => {
		await openGrid(page);
		await loadPages(page, PAGES_TO_LOAD);
		await scrollTo(page, 5000);
		await page.waitForTimeout(600);

		const scrolled = await measure(page);

		expect(scrolled.offGrid).toBe(0);
		expect(scrolled.holes).toBe(0);
		expect(scrolled.rowsAbove).toBe(true);
		expect(scrolled.topLeftRadius).toBe("0px");
		expect(scrolled.rowsBelow).toBe(true);
		expect(scrolled.radiusBottom).toBe("0px");

		await scrollTo(page, 0);
		await page.waitForTimeout(600);

		const top = await measure(page);

		expect(top.rowsAbove).toBe(false);
		expect(top.topLeftRadius).not.toBe("0px");
		expect(top.radiusBottom).toBe("0px");
	});
});
