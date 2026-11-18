import type { currentPlatform } from "#lib/platform/os.ts";

export type RovingMove =
	| "previous"
	| "next"
	| "rowAbove"
	| "rowBelow"
	| "rowStart"
	| "rowEnd"
	| "first"
	| "last"
	| "pageUp"
	| "pageDown"
	| "previousCell"
	| "nextCell";
export type RovingWrap = "none" | "rows" | "loop";
export type RovingOrientation = "vertical" | "horizontal" | "both" | "grid";
export type RovingEdge = "up" | "down" | "left" | "right";
export type RovingDirection = "ltr" | "rtl";
export type RovingPlatform = ReturnType<typeof currentPlatform>;
export type RovingGeometry = {
	count: number;
	columns: number;
	sectionStarts: readonly number[];
	pageRows: number;
};

type Row = { start: number; end: number };

const commandArrowsReachEnds: Record<RovingPlatform, boolean> = {
	macos: true,
	ios: true,
	windows: false,
	linux: false,
	android: false,
};

const forwardMoves: ReadonlySet<RovingMove> = new Set<RovingMove>([
	"next",
	"rowBelow",
	"rowEnd",
	"last",
	"pageDown",
	"nextCell",
]);

function isForwardMove(move: RovingMove): boolean {
	return forwardMoves.has(move);
}

export function isCellMove(
	move: RovingMove,
): move is "previousCell" | "nextCell" {
	return move === "previousCell" || move === "nextCell";
}

function arrowMove({
	key,
	orientation,
	direction,
	hasCells,
}: {
	key: string;
	orientation: RovingOrientation;
	direction: RovingDirection;
	hasCells: boolean;
}): RovingMove | null {
	const rtl = direction === "rtl";
	const inline = key === "ArrowLeft" || key === "ArrowRight";
	const towardInlineEnd = (key === "ArrowRight") !== rtl;
	const towardBlockEnd = key === "ArrowDown";
	switch (orientation) {
		case "vertical":
			if (!inline) return towardBlockEnd ? "next" : "previous";
			if (!hasCells) return null;
			return towardInlineEnd ? "nextCell" : "previousCell";
		case "horizontal":
			if (!inline) return null;
			return towardInlineEnd ? "next" : "previous";
		case "both":
			if (inline) return towardInlineEnd ? "next" : "previous";
			return towardBlockEnd ? "next" : "previous";
		case "grid":
			if (inline) return towardInlineEnd ? "next" : "previous";
			return towardBlockEnd ? "rowBelow" : "rowAbove";
	}
}

function unmodifiedMove({
	event,
	orientation,
	direction,
	hasCells,
	cellIsLink,
}: {
	event: KeyboardEvent;
	orientation: RovingOrientation;
	direction: RovingDirection;
	hasCells: boolean;
	cellIsLink: boolean;
}): RovingMove | null {
	const pages = orientation !== "horizontal";
	switch (event.key) {
		case "ArrowUp":
		case "ArrowDown":
		case "ArrowLeft":
		case "ArrowRight":
			return arrowMove({
				key: event.key,
				orientation,
				direction,
				hasCells,
			});
		case "Home":
			return orientation === "grid" ? "rowStart" : "first";
		case "End":
			return orientation === "grid" ? "rowEnd" : "last";
		case "PageUp":
			return pages ? "pageUp" : null;
		case "PageDown":
			return pages ? "pageDown" : null;
		case " ":
			return pages && cellIsLink ? "pageDown" : null;
		default:
			return null;
	}
}

export function moveForKey({
	event,
	orientation,
	direction,
	platform,
	hasCells,
	cellIsLink,
}: {
	event: KeyboardEvent;
	orientation: RovingOrientation;
	direction: RovingDirection;
	platform: RovingPlatform;
	hasCells: boolean;
	cellIsLink: boolean;
}): RovingMove | null {
	const { key, altKey, ctrlKey, metaKey, shiftKey } = event;
	if (altKey) return null;
	if (ctrlKey && !metaKey && !shiftKey) {
		if (key === "Home") return "first";
		if (key === "End") return "last";
		return null;
	}
	if (metaKey && !ctrlKey && !shiftKey) {
		if (!commandArrowsReachEnds[platform]) return null;
		if (key === "ArrowUp") return "first";
		if (key === "ArrowDown") return "last";
		return null;
	}
	if (shiftKey && !ctrlKey && !metaKey) {
		const pages = orientation !== "horizontal";
		return key === " " && pages && cellIsLink ? "pageUp" : null;
	}
	if (ctrlKey || metaKey || shiftKey) return null;
	return unmodifiedMove({
		event,
		orientation,
		direction,
		hasCells,
		cellIsLink,
	});
}

export function edgeOfMove({
	key,
	move,
	orientation,
	direction,
}: {
	key: string;
	move: RovingMove;
	orientation: RovingOrientation;
	direction: RovingDirection;
}): RovingEdge {
	switch (key) {
		case "ArrowUp":
			return "up";
		case "ArrowDown":
			return "down";
		case "ArrowLeft":
			return "left";
		case "ArrowRight":
			return "right";
	}
	const inlineStart = direction === "rtl" ? "right" : "left";
	const inlineEnd = direction === "rtl" ? "left" : "right";
	if (move === "rowStart" || move === "previousCell") return inlineStart;
	if (move === "rowEnd" || move === "nextCell") return inlineEnd;
	if (orientation === "horizontal")
		return isForwardMove(move) ? inlineEnd : inlineStart;
	return isForwardMove(move) ? "down" : "up";
}

function layoutRows({
	count,
	columns,
	sectionStarts,
}: Pick<RovingGeometry, "count" | "columns" | "sectionStarts">): Row[] {
	const perRow = Math.max(1, Math.floor(columns));
	const starts = [
		...new Set([
			0,
			...sectionStarts.filter(
				(start) =>
					Number.isInteger(start) && start > 0 && start < count,
			),
		]),
	].toSorted((a, b) => a - b);
	return starts.flatMap((sectionStart, section) => {
		const sectionEnd = starts[section + 1] ?? count;
		const rows: Row[] = [];
		for (let start = sectionStart; start < sectionEnd; start += perRow)
			rows.push({ start, end: Math.min(start + perRow, sectionEnd) });
		return rows;
	});
}

function cellInRow({ row, column }: { row: Row; column: number }): number {
	return Math.min(row.start + column, row.end - 1);
}

function rowJump({
	rows,
	row,
	column,
	by,
	wrap,
}: {
	rows: Row[];
	row: number;
	column: number;
	by: number;
	wrap: RovingWrap;
}): number | null {
	const landing = row + by;
	if (landing >= 0 && landing < rows.length)
		return cellInRow({ row: rows[landing]!, column });
	if (wrap !== "loop" || Math.abs(by) !== 1) return null;
	const wrapped = rows[landing < 0 ? rows.length - 1 : 0]!;
	return cellInRow({ row: wrapped, column });
}

function pageJump({
	rows,
	row,
	column,
	by,
}: {
	rows: Row[];
	row: number;
	column: number;
	by: number;
}): number {
	const landing = Math.min(Math.max(row + by, 0), rows.length - 1);
	return cellInRow({ row: rows[landing]!, column });
}

function linearStep({
	from,
	count,
	row,
	step,
	wrap,
	columns,
}: {
	from: number;
	count: number;
	row: Row;
	step: 1 | -1;
	wrap: RovingWrap;
	columns: number;
}): number | null {
	const landing = from + step;
	const staysInRow = wrap === "none" && columns > 1;
	if (staysInRow && (landing < row.start || landing >= row.end)) return null;
	if (landing >= 0 && landing < count) return landing;
	if (wrap !== "loop") return null;
	return landing < 0 ? count - 1 : 0;
}

export function targetIndex({
	move,
	from,
	geometry,
	wrap,
}: {
	move: RovingMove;
	from: number;
	geometry: RovingGeometry;
	wrap: RovingWrap;
}): number {
	const { count } = geometry;
	if (from < 0 || from >= count) return from;
	const rows = layoutRows(geometry);
	const row = rows.findIndex(({ end }) => from < end);
	const column = from - rows[row]!.start;
	const pageRows = Math.max(1, Math.floor(geometry.pageRows));
	const landing = (() => {
		switch (move) {
			case "previous":
			case "next":
				return linearStep({
					from,
					count,
					row: rows[row]!,
					step: move === "next" ? 1 : -1,
					wrap,
					columns: geometry.columns,
				});
			case "rowAbove":
			case "rowBelow":
				return rowJump({
					rows,
					row,
					column,
					by: move === "rowBelow" ? 1 : -1,
					wrap,
				});
			case "rowStart":
				return rows[row]!.start;
			case "rowEnd":
				return rows[row]!.end - 1;
			case "first":
				return 0;
			case "last":
				return count - 1;
			case "pageUp":
				return pageJump({ rows, row, column, by: -pageRows });
			case "pageDown":
				return pageJump({ rows, row, column, by: pageRows });
			case "previousCell":
			case "nextCell":
				return null;
		}
	})();
	return landing ?? from;
}

export const skipStep: Record<RovingMove, "previous" | "next"> = {
	previous: "previous",
	next: "next",
	rowAbove: "previous",
	rowBelow: "next",
	rowStart: "next",
	rowEnd: "previous",
	first: "next",
	last: "previous",
	pageUp: "previous",
	pageDown: "next",
	previousCell: "previous",
	nextCell: "next",
};

export function rowsPerPage({
	from,
	geometry,
	downward,
	bandHeight,
	topAt,
}: {
	from: number;
	geometry: RovingGeometry;
	downward: boolean;
	bandHeight: number;
	topAt: (index: number) => number | null;
}): number {
	const originTop = topAt(from);
	if (originTop === null) return 1;
	const move = downward ? "rowBelow" : "rowAbove";
	let rows = 0;
	for (let index = from; ; ) {
		const next = targetIndex({ move, from: index, geometry, wrap: "none" });
		if (next === index) return Math.max(1, rows);
		rows++;
		index = next;
		const top = topAt(index);
		if (top === null || Math.abs(top - originTop) >= bandHeight)
			return rows;
	}
}

export function nearestIndex({
	from,
	count,
	accepts,
}: {
	from: number;
	count: number;
	accepts: (index: number) => boolean;
}): number | null {
	const reach = Math.max(from + 1, count - from);
	for (let distance = 0; distance <= reach; distance++)
		for (const index of [from - distance, from + distance])
			if (index >= 0 && index < count && accepts(index)) return index;
	return null;
}

export type TypedText = { text: string; at: number };

const TYPEAHEAD_RESET_MS = 500;

export function extendTypedText({
	typed,
	event,
}: {
	typed: TypedText;
	event: KeyboardEvent;
}): TypedText | null {
	const { key, ctrlKey, metaKey, altKey, timeStamp } = event;
	if (key.length !== 1 || ctrlKey || metaKey || altKey) return null;
	const continues = timeStamp - typed.at < TYPEAHEAD_RESET_MS;
	const text = continues ? typed.text + key : key;
	return text === " " ? null : { text, at: timeStamp };
}

export function typeaheadIndex({
	typed,
	from,
	count,
	labelAt,
}: {
	typed: string;
	from: number;
	count: number;
	labelAt: (index: number) => string | null;
}): number | null {
	const needle = typed.toLocaleLowerCase();
	const repeated = [...needle].every((character) => character === needle[0]);
	const prefix = repeated ? needle.slice(0, 1) : needle;
	const start = Math.max(0, from + (prefix.length === 1 ? 1 : 0));
	for (let offset = 0; offset < count; offset++) {
		const index = (start + offset) % count;
		const label = labelAt(index)?.trim().toLocaleLowerCase();
		if (label?.startsWith(prefix)) return index;
	}
	return null;
}
