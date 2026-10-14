import { expect, type Locator, type Page } from "@playwright/test";

import { DRAWER } from "./drawer";
import { GAYMOJI_TAB, gaymojiRegion } from "./stickers";

const OVERSCAN_PX = 600;

type SectionLayout = {
	title: string;
	headerOffset: number;
	mountedRows: number;
	rowsNearView: number;
	blankRowsInView: number;
	offGridTiles: number;
	tiles: [slot: number, label: string][];
};

export type WindowLayout = {
	scrollTop: number;
	scrollHeight: number;
	maxScrollTop: number;
	peekPx: number;
	sections: SectionLayout[];
};

export function windowLayout(page: Page): Promise<WindowLayout> {
	return page
		.locator(DRAWER)
		.locator(GAYMOJI_TAB)
		.evaluate((content, overscanPx) => {
			const scroller = content.closest<HTMLElement>(
				'[data-slot="sheet-scroller"]',
			)!;
			const view = scroller.getBoundingClientRect();
			const visibleTop = Math.max(view.top, 0);
			const visibleBottom = Math.min(view.bottom, window.innerHeight);
			const contentTop = content.getBoundingClientRect().top;
			const sections = [
				...content.querySelectorAll<HTMLElement>(
					'[data-slot="gaymoji-section"]',
				),
			].map((section) => {
				const heading = section.querySelector("h3")!;
				const grid = section.querySelector<HTMLElement>(
					'[data-slot="sticker-grid"]',
				)!;
				const style = getComputedStyle(grid);
				const columns = style.gridTemplateColumns
					.trim()
					.split(/\s+/).length;
				const rowGap = Number.parseFloat(style.rowGap);
				const columnGap = Number.parseFloat(style.columnGap);
				const area = grid.getBoundingClientRect();
				const cell = (area.width - (columns - 1) * columnGap) / columns;
				const stride = cell + rowGap;
				const rows = Math.round((area.height + rowGap) / stride);
				const tilesPerRow = new Map<number, number>();
				const tiles: [number, string][] = [];
				let offGridTiles = 0;
				for (const tile of grid.querySelectorAll<HTMLElement>(
					'[data-slot="sticker-tile"]',
				)) {
					const rect = tile.getBoundingClientRect();
					const rowAt = (rect.top - area.top) / stride;
					const row = Math.round(rowAt);
					const column = Math.round(
						(rect.left - area.left) / (cell + columnGap),
					);
					if (Math.abs(rowAt - row) * stride > 1) offGridTiles += 1;
					tilesPerRow.set(row, (tilesPerRow.get(row) ?? 0) + 1);
					tiles.push([
						row * columns + column,
						tile.getAttribute("aria-label") ?? "",
					]);
				}
				const overlaps = ({
					row,
					top,
					bottom,
				}: {
					row: number;
					top: number;
					bottom: number;
				}) => {
					const rowTop = area.top + row * stride;
					return rowTop < bottom && rowTop + cell > top;
				};
				let rowsNearView = 0;
				let blankRowsInView = 0;
				for (let row = 0; row < rows; row++) {
					if (
						overlaps({
							row,
							top: view.top - overscanPx - 1,
							bottom: view.bottom + overscanPx + 1,
						})
					)
						rowsNearView += 1;
					const filled =
						(tilesPerRow.get(row) ?? 0) >=
						(row < rows - 1 ? columns : 1);
					if (
						overlaps({
							row,
							top: visibleTop,
							bottom: visibleBottom,
						}) &&
						!filled
					)
						blankRowsInView += 1;
				}
				return {
					title: heading.textContent?.trim() ?? "",
					headerOffset:
						heading.getBoundingClientRect().top - contentTop,
					mountedRows: tilesPerRow.size,
					rowsNearView,
					blankRowsInView,
					offGridTiles,
					tiles,
				};
			});
			return {
				scrollTop: scroller.scrollTop,
				scrollHeight: scroller.scrollHeight,
				maxScrollTop: scroller.scrollHeight - scroller.clientHeight,
				peekPx:
					scroller.querySelector<HTMLElement>(
						'[data-slot="sheet-peek"]',
					)?.offsetHeight ?? 0,
				sections,
			};
		}, OVERSCAN_PX);
}

export function mountedTiles({ sections }: WindowLayout): number {
	return sections.reduce((total, { tiles }) => total + tiles.length, 0);
}

export function expectWindowed(layout: WindowLayout) {
	const at = `at scrollTop ${layout.scrollTop}`;
	expect(
		layout.sections.map(({ title, blankRowsInView, offGridTiles }) => ({
			title,
			blankRowsInView,
			offGridTiles,
		})),
		at,
	).toEqual(
		layout.sections.map(({ title }) => ({
			title,
			blankRowsInView: 0,
			offGridTiles: 0,
		})),
	);
	for (const { title, mountedRows, rowsNearView } of layout.sections) {
		expect(mountedRows, `${title} ${at}`).toBeLessThanOrEqual(
			rowsNearView + 1,
		);
	}
}

type ReadingPosition = { title: string; label: string; fraction: number };

export function scrollIntoRow(
	page: Page,
	{ title, row, fraction }: { title: string; row: number; fraction: number },
): Promise<void> {
	return gaymojiRegion(page, { title })
		.locator('[data-slot="sticker-grid"]')
		.evaluate(
			(grid, { row, fraction }) =>
				new Promise<void>((resolve) => {
					const scroller = grid.closest(
						'[data-slot="sheet-scroller"]',
					)!;
					const style = getComputedStyle(grid);
					const columns = style.gridTemplateColumns
						.trim()
						.split(/\s+/).length;
					const cell =
						(grid.getBoundingClientRect().width -
							(columns - 1) *
								Number.parseFloat(style.columnGap)) /
						columns;
					scroller.scrollTop +=
						grid.getBoundingClientRect().top -
						scroller.getBoundingClientRect().top +
						(row + fraction) *
							(cell + Number.parseFloat(style.rowGap));
					requestAnimationFrame(() =>
						requestAnimationFrame(() => resolve()),
					);
				}),
			{ row, fraction },
		);
}

export function readingPosition(page: Page): Promise<ReadingPosition | null> {
	return page
		.locator(DRAWER)
		.locator(GAYMOJI_TAB)
		.evaluate((content) => {
			const top = content
				.closest('[data-slot="sheet-scroller"]')!
				.getBoundingClientRect().top;
			for (const section of content.querySelectorAll(
				'[data-slot="gaymoji-section"]',
			)) {
				const grid = section.querySelector(
					'[data-slot="sticker-grid"]',
				)!;
				const rowGap = Number.parseFloat(getComputedStyle(grid).rowGap);
				for (const tile of grid.querySelectorAll(
					'[data-slot="sticker-tile"]',
				)) {
					const rect = tile.getBoundingClientRect();
					if (rect.bottom + rowGap <= top) continue;
					if (rect.top > top) return null;
					return {
						title: section.querySelector("h3")!.textContent.trim(),
						label: tile.getAttribute("aria-label") ?? "",
						fraction: (top - rect.top) / (rect.height + rowGap),
					};
				}
			}
			return null;
		});
}

export function rowOffsetUnderTop(
	tile: Locator,
): Promise<{ offsetPx: number; stridePx: number }> {
	return tile.evaluate((element) => {
		const top = element
			.closest('[data-slot="sheet-scroller"]')!
			.getBoundingClientRect().top;
		const rowGap = Number.parseFloat(
			getComputedStyle(element.closest('[data-slot="sticker-grid"]')!)
				.rowGap,
		);
		const rect = element.getBoundingClientRect();
		return { offsetPx: top - rect.top, stridePx: rect.height + rowGap };
	});
}
