export type GridMetrics = { columns: number; cellPx: number; gapPx: number };

export type GridWindow = {
	startIndex: number;
	endIndex: number;
	paddingTopPx: number;
	paddingBottomPx: number;
	hasRowsAbove: boolean;
	hasRowsBelow: boolean;
};

export function gridWindow({
	count,
	metrics: { columns, cellPx, gapPx },
	offsetPx,
	viewportPx,
	overscanPx,
}: {
	count: number;
	metrics: GridMetrics;
	offsetPx: number;
	viewportPx: number;
	overscanPx: number;
}): GridWindow {
	if (columns < 1 || cellPx <= 0 || count < 1) {
		return {
			startIndex: 0,
			endIndex: count,
			paddingTopPx: 0,
			paddingBottomPx: 0,
			hasRowsAbove: false,
			hasRowsBelow: false,
		};
	}

	const rowStride = cellPx + gapPx;
	const rows = Math.ceil(count / columns);
	const firstRow = Math.min(
		rows,
		Math.max(0, Math.floor((offsetPx - overscanPx) / rowStride)),
	);
	const lastRow = Math.min(
		rows,
		Math.max(
			firstRow,
			Math.ceil((offsetPx + viewportPx + overscanPx) / rowStride),
		),
	);

	return {
		startIndex: firstRow * columns,
		endIndex: Math.min(count, lastRow * columns),
		paddingTopPx: firstRow * rowStride,
		paddingBottomPx: (rows - lastRow) * rowStride,
		hasRowsAbove: firstRow > 0,
		hasRowsBelow: lastRow < rows,
	};
}
