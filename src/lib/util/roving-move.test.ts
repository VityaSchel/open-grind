import { describe, expect, it } from "vitest";

import {
	edgeOfMove,
	moveForKey,
	nearestIndex,
	type RovingDirection,
	type RovingGeometry,
	type RovingMove,
	type RovingOrientation,
	type RovingPlatform,
	type RovingWrap,
	rowsPerPage,
	skipStep,
	targetIndex,
	typeaheadIndex,
} from "./roving-move";

type Modifier = "alt" | "ctrl" | "meta" | "shift";
type Landing = [move: RovingMove, from: number, wrap: RovingWrap, to: number];

function keyFor({
	key,
	modifiers = [],
	platform = "windows",
	orientation = "vertical",
	direction = "ltr",
	hasCells = false,
	cellIsLink = false,
}: {
	key: string;
	modifiers?: Modifier[];
	platform?: RovingPlatform;
	orientation?: RovingOrientation;
	direction?: RovingDirection;
	hasCells?: boolean;
	cellIsLink?: boolean;
}): RovingMove | null {
	const event = new KeyboardEvent("keydown", {
		key,
		altKey: modifiers.includes("alt"),
		ctrlKey: modifiers.includes("ctrl"),
		metaKey: modifiers.includes("meta"),
		shiftKey: modifiers.includes("shift"),
	});
	return moveForKey({
		event,
		orientation,
		direction,
		platform,
		hasCells,
		cellIsLink,
	});
}

function geometry({
	count,
	columns = 1,
	sectionStarts = [],
	pageRows = 1,
}: Partial<RovingGeometry> & { count: number }): RovingGeometry {
	return { count, columns, sectionStarts, pageRows };
}

function expectLandings({
	layout,
	landings,
}: {
	layout: RovingGeometry;
	landings: Landing[];
}): void {
	for (const [move, from, wrap, to] of landings)
		expect(
			targetIndex({ move, from, geometry: layout, wrap }),
			`${move} from ${from} (${wrap})`,
		).toBe(to);
}

const arrows = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"] as const;

describe("moveForKey arrows", () => {
	it.each<[RovingOrientation, boolean, (RovingMove | null)[]]>([
		["vertical", false, ["previous", "next", null, null]],
		["vertical", true, ["previous", "next", "previousCell", "nextCell"]],
		["horizontal", false, [null, null, "previous", "next"]],
		["both", false, ["previous", "next", "previous", "next"]],
		["grid", false, ["rowAbove", "rowBelow", "previous", "next"]],
	])(
		"maps Up, Down, Left, Right in a %s composite (cells: %s)",
		(orientation, hasCells, expected) => {
			const moves = arrows.map((key) =>
				keyFor({ key, orientation, hasCells }),
			);
			expect(moves).toEqual(expected);
		},
	);

	it.each<[RovingOrientation, boolean, (RovingMove | null)[]]>([
		["vertical", true, ["previous", "next", "nextCell", "previousCell"]],
		["horizontal", false, [null, null, "next", "previous"]],
		["both", false, ["previous", "next", "next", "previous"]],
		["grid", false, ["rowAbove", "rowBelow", "next", "previous"]],
	])(
		"swaps Left and Right but never Up and Down under RTL in a %s composite",
		(orientation, hasCells, expected) => {
			const direction = "rtl";
			const moves = arrows.map((key) =>
				keyFor({ key, orientation, hasCells, direction }),
			);
			expect(moves).toEqual(expected);
		},
	);
});

describe("moveForKey Home, End and paging", () => {
	it.each<[RovingOrientation, RovingMove, RovingMove]>([
		["vertical", "first", "last"],
		["horizontal", "first", "last"],
		["both", "first", "last"],
		["grid", "rowStart", "rowEnd"],
	])(
		"sends Home and End in a %s composite to %s and %s",
		(orientation, home, end) => {
			expect(keyFor({ key: "Home", orientation })).toBe(home);
			expect(keyFor({ key: "End", orientation })).toBe(end);
		},
	);

	it.each<RovingOrientation>(["vertical", "both", "grid"])(
		"pages with PageUp and PageDown in a %s composite",
		(orientation) => {
			expect(keyFor({ key: "PageUp", orientation })).toBe("pageUp");
			expect(keyFor({ key: "PageDown", orientation })).toBe("pageDown");
		},
	);

	it("leaves PageUp, PageDown and Space to the page in a toolbar", () => {
		const orientation = "horizontal";

		expect(keyFor({ key: "PageUp", orientation })).toBeNull();
		expect(keyFor({ key: "PageDown", orientation })).toBeNull();
		expect(keyFor({ key: " ", orientation, cellIsLink: true })).toBeNull();
	});

	it("pages with Space and Shift+Space only on a link", () => {
		const shift: Modifier[] = ["shift"];

		expect(keyFor({ key: " ", cellIsLink: true })).toBe("pageDown");
		expect(keyFor({ key: " ", modifiers: shift, cellIsLink: true })).toBe(
			"pageUp",
		);
		expect(keyFor({ key: " " })).toBeNull();
		expect(keyFor({ key: " ", modifiers: shift })).toBeNull();
	});
});

describe("moveForKey modifiers", () => {
	it.each<RovingPlatform>([
		"windows",
		"linux",
		"android",
		"macos",
		"ios",
		"web",
	])("jumps to the ends with Ctrl+Home and Ctrl+End on %s", (platform) => {
		const modifiers: Modifier[] = ["ctrl"];
		for (const orientation of ["vertical", "grid"] as const) {
			const keys = { modifiers, platform, orientation };
			expect(keyFor({ key: "Home", ...keys })).toBe("first");
			expect(keyFor({ key: "End", ...keys })).toBe("last");
		}
	});

	it.each<RovingPlatform>(["macos", "ios"])(
		"jumps to the ends with Cmd+ArrowUp and Cmd+ArrowDown on %s",
		(platform) => {
			const modifiers: Modifier[] = ["meta"];
			for (const orientation of [
				"vertical",
				"horizontal",
				"grid",
			] as const) {
				const keys = { modifiers, platform, orientation };
				expect(keyFor({ key: "ArrowUp", ...keys })).toBe("first");
				expect(keyFor({ key: "ArrowDown", ...keys })).toBe("last");
			}
		},
	);

	it.each<RovingPlatform>(["windows", "linux", "android", "web"])(
		"leaves Meta+ArrowUp and Meta+ArrowDown to the system on %s",
		(platform) => {
			const keys = { modifiers: ["meta"] as Modifier[], platform };
			expect(keyFor({ key: "ArrowUp", ...keys })).toBeNull();
			expect(keyFor({ key: "ArrowDown", ...keys })).toBeNull();
		},
	);

	it("leaves Cmd+ArrowLeft and Cmd+ArrowRight to the system on macOS", () => {
		const keys = {
			modifiers: ["meta"] as Modifier[],
			platform: "macos" as const,
			hasCells: true,
		};
		expect(keyFor({ key: "ArrowLeft", ...keys })).toBeNull();
		expect(keyFor({ key: "ArrowRight", ...keys })).toBeNull();
	});

	it.each<[string, Modifier[]]>([
		["ArrowDown", ["alt"]],
		["ArrowLeft", ["alt"]],
		["ArrowDown", ["ctrl"]],
		["ArrowRight", ["ctrl"]],
		["ArrowDown", ["shift"]],
		["Home", ["shift"]],
		["End", ["ctrl", "shift"]],
		["Home", ["ctrl", "meta"]],
		["ArrowUp", ["meta", "shift"]],
		["PageDown", ["ctrl"]],
	])("ignores %s with %s", (key, modifiers) => {
		for (const platform of ["windows", "macos"] as const) {
			const keys = { orientation: "grid" as const, cellIsLink: true };
			expect(keyFor({ key, modifiers, platform, ...keys })).toBeNull();
		}
	});

	it("ignores keys that never move focus", () => {
		for (const key of ["Enter", "Tab", "Escape", "a", "Delete"])
			expect(
				keyFor({ key, orientation: "grid", cellIsLink: true }),
			).toBeNull();
	});
});

describe("edgeOfMove", () => {
	it.each<[string, RovingMove, RovingOrientation, RovingDirection, string]>([
		["ArrowLeft", "nextCell", "vertical", "rtl", "left"],
		["ArrowUp", "first", "vertical", "ltr", "up"],
		["Home", "first", "vertical", "ltr", "up"],
		["Home", "first", "grid", "ltr", "up"],
		["PageDown", "pageDown", "both", "ltr", "down"],
		["End", "last", "grid", "ltr", "down"],
		["Home", "first", "horizontal", "ltr", "left"],
		["End", "last", "horizontal", "rtl", "left"],
		["Home", "rowStart", "grid", "rtl", "right"],
		["End", "rowEnd", "grid", "ltr", "right"],
	])(
		"puts %s (%s) in a %s %s composite at the %s edge",
		(key, move, orientation, direction, edge) => {
			expect(edgeOfMove({ key, move, orientation, direction })).toBe(
				edge,
			);
		},
	);
});

describe("targetIndex in a list", () => {
	const list = geometry({ count: 5 });

	it("steps to the neighbors and stops at the ends unless it loops", () => {
		expectLandings({
			layout: list,
			landings: [
				["next", 2, "none", 3],
				["previous", 2, "rows", 1],
				["next", 4, "none", 4],
				["next", 4, "rows", 4],
				["previous", 0, "none", 0],
				["next", 4, "loop", 0],
				["previous", 0, "loop", 4],
			],
		});
	});

	it("jumps to the first and last item", () => {
		expectLandings({
			layout: list,
			landings: [
				["first", 3, "none", 0],
				["last", 1, "none", 4],
				["first", 0, "loop", 0],
			],
		});
	});

	it("pages by the given rows and clamps at the ends", () => {
		expectLandings({
			layout: geometry({ count: 20, pageRows: 6 }),
			landings: [
				["pageDown", 2, "none", 8],
				["pageDown", 17, "loop", 19],
				["pageUp", 4, "loop", 0],
				["pageUp", 0, "none", 0],
			],
		});
	});

	it("leaves the item in place for cell moves", () => {
		expectLandings({
			layout: list,
			landings: [
				["previousCell", 2, "loop", 2],
				["nextCell", 2, "loop", 2],
			],
		});
	});

	it("blocks every move in an empty list or from an index outside it", () => {
		for (const move of ["next", "first", "last", "pageDown"] as const) {
			const empty = geometry({ count: 0 });
			expect(
				targetIndex({ move, from: 0, geometry: empty, wrap: "loop" }),
			).toBe(0);
			expect(
				targetIndex({ move, from: -1, geometry: list, wrap: "loop" }),
			).toBe(-1);
			expect(
				targetIndex({ move, from: 5, geometry: list, wrap: "loop" }),
			).toBe(5);
		}
	});

	it("treats an unmeasured zero-column grid as a list", () => {
		expectLandings({
			layout: geometry({ count: 4, columns: 0 }),
			landings: [
				["rowBelow", 1, "none", 2],
				["next", 1, "none", 2],
			],
		});
	});
});

describe.each([2, 3, 4, 5, 6, 7])(
	"targetIndex in a %i-column grid",
	(columns) => {
		const count = columns * 3 + 1;
		const layout = geometry({ count, columns, pageRows: 2 });
		const lastRowStart = columns * 3;
		const lastColumn = columns - 1;
		const at = ({ row, column }: { row: number; column: number }) =>
			row * columns + column;
		const everyColumn = Array.from(
			{ length: columns },
			(_, column) => column,
		);

		it("moves down and up keeping the column", () => {
			expectLandings({
				layout,
				landings: everyColumn.flatMap((column): Landing[] => [
					[
						"rowBelow",
						at({ row: 0, column }),
						"rows",
						at({ row: 1, column }),
					],
					[
						"rowAbove",
						at({ row: 2, column }),
						"none",
						at({ row: 1, column }),
					],
				]),
			});
		});

		it("lands on the last item when the last row is shorter", () => {
			expectLandings({
				layout,
				landings: everyColumn.map(
					(column): Landing => [
						"rowBelow",
						at({ row: 2, column }),
						"rows",
						lastRowStart,
					],
				),
			});
		});

		it("goes up from the short last row into the same column", () => {
			expectLandings({
				layout,
				landings: [
					[
						"rowAbove",
						lastRowStart,
						"none",
						at({ row: 2, column: 0 }),
					],
				],
			});
		});

		it("stops at the top and bottom rows unless it loops", () => {
			expectLandings({
				layout,
				landings: [
					["rowAbove", lastColumn, "none", lastColumn],
					["rowAbove", lastColumn, "rows", lastColumn],
					["rowBelow", lastRowStart, "none", lastRowStart],
					["rowBelow", lastRowStart, "rows", lastRowStart],
					["rowAbove", lastColumn, "loop", lastRowStart],
					["rowBelow", lastRowStart, "loop", 0],
				],
			});
		});

		it("keeps Left and Right inside the row without row wrapping", () => {
			const rowStart = at({ row: 1, column: 0 });
			const rowEnd = at({ row: 1, column: lastColumn });
			expectLandings({
				layout,
				landings: [
					["next", rowEnd, "none", rowEnd],
					["previous", rowStart, "none", rowStart],
					["next", rowStart, "none", rowStart + 1],
				],
			});
		});

		it("crosses row ends with row wrapping and stops at the ends", () => {
			const rowEnd = at({ row: 1, column: lastColumn });
			expectLandings({
				layout,
				landings: [
					["next", rowEnd, "rows", rowEnd + 1],
					["previous", rowEnd + 1, "rows", rowEnd],
					["next", count - 1, "rows", count - 1],
					["previous", 0, "rows", 0],
				],
			});
		});

		it("loops from the last item to the first and back", () => {
			expectLandings({
				layout,
				landings: [
					["next", count - 1, "loop", 0],
					["previous", 0, "loop", count - 1],
				],
			});
		});

		it("goes to the start and end of the current row", () => {
			const middle = at({ row: 1, column: Math.floor(columns / 2) });
			expectLandings({
				layout,
				landings: [
					["rowStart", middle, "none", at({ row: 1, column: 0 })],
					[
						"rowEnd",
						middle,
						"none",
						at({ row: 1, column: lastColumn }),
					],
					["rowEnd", lastRowStart, "none", lastRowStart],
				],
			});
		});

		it("pages by whole rows in the same column and clamps to the short last row", () => {
			expectLandings({
				layout,
				landings: [
					[
						"pageDown",
						at({ row: 0, column: lastColumn }),
						"rows",
						at({ row: 2, column: lastColumn }),
					],
					[
						"pageDown",
						at({ row: 2, column: lastColumn }),
						"rows",
						lastRowStart,
					],
					["pageUp", lastRowStart, "rows", at({ row: 1, column: 0 })],
				],
			});
		});
	},
);

describe("targetIndex across sections", () => {
	const sectioned = geometry({
		count: 15,
		columns: 4,
		sectionStarts: [0, 6, 7],
	});

	it("starts every section on a new row", () => {
		expectLandings({
			layout: sectioned,
			landings: [
				["rowEnd", 4, "none", 5],
				["rowStart", 9, "none", 7],
				["next", 5, "none", 5],
				["next", 5, "rows", 6],
			],
		});
	});

	it("goes down from a section's last row into the next section in the same column, clamped", () => {
		expectLandings({
			layout: sectioned,
			landings: [
				["rowBelow", 5, "none", 6],
				["rowBelow", 6, "none", 7],
				["rowBelow", 3, "none", 5],
			],
		});
	});

	it("goes up into the previous section's partial last row, clamped", () => {
		expectLandings({
			layout: sectioned,
			landings: [
				["rowAbove", 10, "none", 6],
				["rowAbove", 6, "none", 4],
				["rowAbove", 14, "none", 10],
			],
		});
	});

	it("puts an item alone on the top row when the second section starts at 1", () => {
		expectLandings({
			layout: geometry({ count: 7, columns: 3, sectionStarts: [0, 1] }),
			landings: [
				["rowBelow", 0, "rows", 1],
				["rowAbove", 3, "rows", 0],
				["next", 0, "rows", 1],
				["next", 0, "none", 0],
			],
		});
	});

	it("ignores section starts that are unsorted, repeated or outside the list", () => {
		const messy = geometry({
			count: 15,
			columns: 4,
			sectionStarts: [7, 6, 6, -2, 0, 15, 40],
		});
		for (const from of [3, 5, 6, 10, 13])
			for (const move of ["rowAbove", "rowBelow", "rowEnd"] as const) {
				const wrap = "none";
				expect(targetIndex({ move, from, geometry: messy, wrap })).toBe(
					targetIndex({ move, from, geometry: sectioned, wrap }),
				);
			}
	});
});

describe("skipStep", () => {
	it("skips onward in the direction of travel and inward from the ends", () => {
		expect(skipStep.next).toBe("next");
		expect(skipStep.rowAbove).toBe("previous");
		expect(skipStep.pageDown).toBe("next");
		expect(skipStep.first).toBe("next");
		expect(skipStep.last).toBe("previous");
	});
});

describe("rowsPerPage", () => {
	const layout = geometry({ count: 30, columns: 3 });
	const topAt = (index: number) => Math.floor(index / 3) * 100;
	const page = ({
		from,
		downward = true,
		bandHeight,
		measure = topAt,
	}: {
		from: number;
		downward?: boolean;
		bandHeight: number;
		measure?: (index: number) => number | null;
	}) =>
		rowsPerPage({
			from,
			geometry: layout,
			downward,
			bandHeight,
			topAt: measure,
		});

	it("counts the rows until one starts a full band away from the current row", () => {
		expect(page({ from: 1, bandHeight: 350 })).toBe(4);
		expect(page({ from: 25, downward: false, bandHeight: 200 })).toBe(2);
	});

	it("stops at the last row and at the first row it cannot measure", () => {
		expect(page({ from: 22, bandHeight: 900 })).toBe(2);
		const partly = (index: number) => (index < 10 ? topAt(index) : null);
		expect(page({ from: 1, bandHeight: 900, measure: partly })).toBe(3);
	});

	it("pages at least one row", () => {
		expect(page({ from: 28, bandHeight: 0 })).toBe(1);
		expect(page({ from: 4, bandHeight: 0 })).toBe(1);
		expect(page({ from: 4, bandHeight: 50, measure: () => null })).toBe(1);
	});
});

describe("nearestIndex", () => {
	it("prefers the index itself, then the closer neighbor, then the earlier one", () => {
		const accepts = (index: number) => [2, 5, 9].includes(index);

		expect(nearestIndex({ from: 5, count: 10, accepts })).toBe(5);
		expect(nearestIndex({ from: 7, count: 10, accepts })).toBe(5);
		expect(nearestIndex({ from: 8, count: 10, accepts })).toBe(9);
		expect(nearestIndex({ from: 0, count: 10, accepts })).toBe(2);
	});

	it("searches from outside the list and gives up when nothing is accepted", () => {
		const only = (wanted: number) => (index: number) => index === wanted;

		expect(nearestIndex({ from: 20, count: 10, accepts: only(3) })).toBe(3);
		expect(nearestIndex({ from: -1, count: 10, accepts: only(8) })).toBe(8);
		expect(
			nearestIndex({ from: 4, count: 10, accepts: only(-1) }),
		).toBeNull();
	});
});

describe("typeaheadIndex", () => {
	const labels = ["Apple", " banana", "Blueberry", "Cherry", "cranberry"];
	const labelAt = (index: number) => labels[index] ?? null;
	const search = ({ typed, from }: { typed: string; from: number }) =>
		typeaheadIndex({ typed, from, count: labels.length, labelAt });

	it("finds a single letter from the next item onward, wrapping around", () => {
		expect(search({ typed: "b", from: 0 })).toBe(1);
		expect(search({ typed: "b", from: 1 })).toBe(2);
		expect(search({ typed: "b", from: 2 })).toBe(1);
		expect(search({ typed: "C", from: -1 })).toBe(3);
	});

	it("matches a longer prefix starting at the current item", () => {
		expect(search({ typed: "bl", from: 2 })).toBe(2);
		expect(search({ typed: "cr", from: 3 })).toBe(4);
	});

	it("cycles through matches when the same letter repeats", () => {
		expect(search({ typed: "bb", from: 1 })).toBe(2);
		expect(search({ typed: "ccc", from: 4 })).toBe(3);
	});

	it("skips unmounted items and reports no match", () => {
		const sparse = (index: number) => (index === 3 ? null : labelAt(index));

		expect(
			typeaheadIndex({ typed: "ch", from: 0, count: 5, labelAt: sparse }),
		).toBeNull();
		expect(search({ typed: "z", from: 0 })).toBeNull();
	});
});
