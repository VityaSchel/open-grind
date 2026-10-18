import { describe, expect, it } from "vitest";

import {
	type GridMetrics,
	gridWindow,
	type GridWindow,
	revealRowScrollTop,
} from "./grid-window";

const metrics: GridMetrics = { columns: 3, cellPx: 128, gapPx: 2 };
const ROW_STRIDE = 130;

const windowAt = (offsetPx: number, count = 60, overscanPx = 0) =>
	gridWindow({ count, metrics, offsetPx, viewportPx: 700, overscanPx });

describe("gridWindow", () => {
	it.each([
		["unmeasured", { columns: 0, cellPx: 0, gapPx: 0 }],
		["collapsed to no width", { columns: 3, cellPx: 0, gapPx: 2 }],
	])("renders the whole list while the grid is %s", (_, metrics) => {
		expect(
			gridWindow({
				count: 60,
				metrics,
				offsetPx: 5000,
				viewportPx: 700,
				overscanPx: 600,
			}),
		).toEqual({
			startIndex: 0,
			endIndex: 60,
			paddingTopPx: 0,
			paddingBottomPx: 0,
			hasRowsAbove: false,
			hasRowsBelow: false,
		});
	});

	it("starts at the first row with nothing scrolled out above", () => {
		expect(windowAt(0)).toMatchObject({
			startIndex: 0,
			paddingTopPx: 0,
			hasRowsAbove: false,
		});
	});

	it("drops the rows scrolled past and pads for them", () => {
		const view = windowAt(ROW_STRIDE * 4);

		expect(view.startIndex).toBe(4 * metrics.columns);
		expect(view.paddingTopPx).toBe(4 * ROW_STRIDE);
		expect(view.hasRowsAbove).toBe(true);
	});

	it("keeps the padded rows and the rendered rows adding up to the full grid", () => {
		const rows = 20;
		for (const offsetPx of [0, 137, 1000, 2598]) {
			const view = windowAt(offsetPx);
			const renderedRows =
				(view.endIndex - view.startIndex) / metrics.columns;

			expect(
				view.paddingTopPx +
					renderedRows * ROW_STRIDE +
					view.paddingBottomPx,
			).toBe(rows * ROW_STRIDE);
		}
	});

	it("covers the viewport plus the overscan on both sides", () => {
		const offsetPx = ROW_STRIDE * 10;
		const view = windowAt(offsetPx, 300, 600);
		const renderedBottomPx =
			view.paddingTopPx +
			((view.endIndex - view.startIndex) / metrics.columns) * ROW_STRIDE;

		expect(view.paddingTopPx).toBeLessThanOrEqual(offsetPx - 600);
		expect(renderedBottomPx).toBeGreaterThanOrEqual(offsetPx + 700 + 600);
	});

	it("reports the rows left below the window", () => {
		const view = windowAt(ROW_STRIDE * 4);

		expect(view.hasRowsBelow).toBe(true);
		expect(view.paddingBottomPx).toBeGreaterThan(0);
	});

	it("stops at the last row and reports nothing below it", () => {
		const view = windowAt(ROW_STRIDE * 20, 60, 600);

		expect(view.endIndex).toBe(60);
		expect(view.paddingBottomPx).toBe(0);
		expect(view.hasRowsBelow).toBe(false);
	});

	it("keeps a partly filled last row whole", () => {
		const view = windowAt(0, 61, 10_000);

		expect(view.endIndex).toBe(61);
		expect(view.paddingBottomPx).toBe(0);
	});

	it("renders nothing above the grid", () => {
		expect(windowAt(-500)).toMatchObject({
			startIndex: 0,
			paddingTopPx: 0,
		});
	});

	describe("height", () => {
		function heightOf({
			view,
			metrics: { columns, cellPx, gapPx },
		}: {
			view: GridWindow;
			metrics: GridMetrics;
		}): number {
			const renderedRows = Math.ceil(
				Math.max(0, view.endIndex - view.startIndex) / columns,
			);
			const renderedPx =
				renderedRows > 0 ? renderedRows * (cellPx + gapPx) - gapPx : 0;
			return view.paddingTopPx + renderedPx + view.paddingBottomPx;
		}

		const FULL_HEIGHT = 20 * ROW_STRIDE - metrics.gapPx;

		it.each([0, 600])(
			"matches a fully rendered grid at every offset with %ipx of overscan",
			(overscanPx) => {
				for (const offsetPx of [
					-10_000, -1301, -1300, -701, -700, 0, 137, 1000, 2597, 2598,
					2599, 3200, 10_000,
				]) {
					expect({
						offsetPx,
						height: heightOf({
							view: windowAt(offsetPx, 60, overscanPx),
							metrics,
						}),
					}).toEqual({ offsetPx, height: FULL_HEIGHT });
				}
			},
		);

		it("pads a grid below the viewport from its bottom, leaving out the gap after its last row", () => {
			expect(windowAt(-10_000, 61)).toMatchObject({
				endIndex: 0,
				paddingTopPx: 0,
				paddingBottomPx: 21 * ROW_STRIDE - metrics.gapPx,
				hasRowsAbove: false,
				hasRowsBelow: true,
			});
		});

		it("pads a grid above the viewport from its top, leaving out the gap after its last row", () => {
			const view = windowAt(10_000, 61);

			expect(view.endIndex).toBeLessThanOrEqual(view.startIndex);
			expect(view).toMatchObject({
				paddingTopPx: 21 * ROW_STRIDE - metrics.gapPx,
				paddingBottomPx: 0,
				hasRowsAbove: true,
				hasRowsBelow: false,
			});
		});

		it("matches a fully rendered grid on fractional tracks", () => {
			const fractional: GridMetrics = {
				columns: 5,
				cellPx: 68.4,
				gapPx: 4,
			};
			const fullHeight =
				Math.ceil(103 / fractional.columns) *
					(fractional.cellPx + fractional.gapPx) -
				fractional.gapPx;
			for (const offsetPx of [-5000, -900, 0, 777, 1500, 5000]) {
				const view = gridWindow({
					count: 103,
					metrics: fractional,
					offsetPx,
					viewportPx: 700,
					overscanPx: 600,
				});

				expect(heightOf({ view, metrics: fractional })).toBeCloseTo(
					fullHeight,
					9,
				);
			}
		});
	});

	it("has no rows to render for an empty grid", () => {
		expect(windowAt(0, 0)).toMatchObject({
			startIndex: 0,
			endIndex: 0,
			paddingTopPx: 0,
			paddingBottomPx: 0,
		});
	});
});

describe("revealRowScrollTop", () => {
	const SAVED_TOP = 1000;
	const HEADER_CLEAR = 76;
	const NAV_CLEAR = 88;
	const VIEWPORT = 800;
	const BAND_TOP = SAVED_TOP + HEADER_CLEAR;
	const BAND_BOTTOM = SAVED_TOP + VIEWPORT - NAV_CLEAR;
	const BAND_CENTER_OFFSET =
		HEADER_CLEAR + (VIEWPORT - HEADER_CLEAR - NAV_CLEAR) / 2;

	const revealAt = (
		rowTopPx: number,
		{
			savedTop = SAVED_TOP,
			maxScrollTop = 10_000,
		}: { savedTop?: number; maxScrollTop?: number } = {},
	) =>
		revealRowScrollTop({
			savedTop,
			rowTopPx,
			rowHeightPx: metrics.cellPx,
			viewportPx: VIEWPORT,
			insetTopPx: HEADER_CLEAR,
			insetBottomPx: NAV_CLEAR,
			maxScrollTop,
		});

	const centeredOn = (rowTopPx: number) =>
		rowTopPx + metrics.cellPx / 2 - BAND_CENTER_OFFSET;

	it("keeps the saved offset while the whole row is in view", () => {
		expect(revealAt(BAND_TOP + 2 * ROW_STRIDE)).toBe(SAVED_TOP);
	});

	it("keeps the saved offset for a row flush with both clearances", () => {
		expect(revealAt(BAND_TOP)).toBe(SAVED_TOP);
		expect(revealAt(BAND_BOTTOM - metrics.cellPx)).toBe(SAVED_TOP);
	});

	it("centers a row scrolled out above the band", () => {
		const rowTopPx = SAVED_TOP - 4 * ROW_STRIDE;

		expect(revealAt(rowTopPx)).toBe(centeredOn(rowTopPx));
	});

	it("centers a row far below the band", () => {
		const rowTopPx = SAVED_TOP + 20 * ROW_STRIDE;

		expect(revealAt(rowTopPx)).toBe(centeredOn(rowTopPx));
	});

	it("centers a row tucked under the header even though it is inside the viewport", () => {
		const rowTopPx = BAND_TOP - 1;

		expect(revealAt(rowTopPx)).toBe(centeredOn(rowTopPx));
	});

	it("centers a row whose top is in the band but whose bottom sits under the navbar clearance", () => {
		const rowTopPx = BAND_BOTTOM - metrics.cellPx / 2;

		expect(rowTopPx).toBeGreaterThan(BAND_TOP);
		expect(rowTopPx).toBeLessThan(BAND_BOTTOM);
		expect(revealAt(rowTopPx)).toBe(centeredOn(rowTopPx));
	});

	it("never scrolls above the top of the grid", () => {
		expect(revealAt(HEADER_CLEAR)).toBe(0);
	});

	it("never scrolls past the end of the grid", () => {
		expect(
			revealAt(SAVED_TOP + 40 * ROW_STRIDE, { maxScrollTop: 4000 }),
		).toBe(4000);
	});
});
