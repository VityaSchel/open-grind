// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

const { computePositionMock } = vi.hoisted(() => ({
	computePositionMock: vi.fn<
		(
			reference: unknown,
			floating: unknown,
			options: { placement: string },
		) => Promise<{ x: number; y: number }>
	>(() => Promise.resolve({ x: 0, y: 0 })),
}));
vi.mock("@floating-ui/dom", async (importOriginal) => ({
	...(await importOriginal<typeof import("@floating-ui/dom")>()),
	computePosition: computePositionMock,
}));

import MediaTileMenu from "./MediaTileMenu.svelte";

const ROUNDING_NUDGES_PX = [-0.25, 0.25];

function gridTile({
	columns,
	column,
	nudge,
}: {
	columns: number;
	column: number;
	nudge: number;
}): HTMLButtonElement {
	const grid = document.createElement("div");
	grid.style.gridTemplateColumns = Array(columns).fill("100px").join(" ");
	const pitch = window.innerWidth / columns;
	const tiles = Array.from({ length: columns * 2 }, (_, index) => {
		const tile = document.createElement("button");
		const left = (index % columns) * pitch + nudge;
		tile.getBoundingClientRect = () => new DOMRect(left, 0, pitch, pitch);
		return tile;
	});
	grid.append(...tiles);
	document.body.append(grid);
	return tiles[columns + column]!;
}

function openedPlacement(tile: HTMLButtonElement): string | undefined {
	computePositionMock.mockClear();
	render(MediaTileMenu, {
		props: {
			tile,
			video: false,
			selected: false,
			onDelete: () => {},
			onClose: () => {},
		},
	});
	return computePositionMock.mock.lastCall?.[2].placement;
}

afterEach(() => {
	cleanup();
	document.body.replaceChildren();
});

describe("media tile menu side", () => {
	for (const columns of [3, 5]) {
		const middle = (columns - 1) / 2;
		for (const nudge of ROUNDING_NUDGES_PX) {
			it(`opens the middle of ${columns} columns to the right when its center sits ${nudge} px off the window's`, () => {
				expect(
					openedPlacement(
						gridTile({ columns, column: middle, nudge }),
					),
				).toBe("right-start");
			});
		}
	}

	for (const [columns, sides] of [
		[2, ["right-start", "left-start"]],
		[3, ["right-start", "right-start", "left-start"]],
		[4, ["right-start", "right-start", "left-start", "left-start"]],
		[
			5,
			[
				"right-start",
				"right-start",
				"right-start",
				"left-start",
				"left-start",
			],
		],
	] as const) {
		it(`opens every one of ${columns} columns toward the middle of the grid`, () => {
			const placements = sides.map((_, column) => {
				const placement = openedPlacement(
					gridTile({ columns, column, nudge: 0 }),
				);
				cleanup();
				return placement;
			});
			expect(placements).toEqual(sides);
		});
	}
});
