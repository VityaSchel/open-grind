import { afterEach, describe, expect, it, vi } from "vitest";

import { revealedGridScrollTop } from "./grid-reveal";

const { revealRowScrollTop } = vi.hoisted(() => ({
	revealRowScrollTop:
		vi.fn<typeof import("$lib/util/grid-window").revealRowScrollTop>(),
}));

vi.mock("$lib/util/grid-window", async (importOriginal) => ({
	...(await importOriginal<typeof import("$lib/util/grid-window")>()),
	revealRowScrollTop,
}));

const COLUMNS = 3;
const CELL_PX = 128;
const ROW_STRIDE = 130;
const HEADER_CLEAR = 76;
const NAV_CLEAR = 88;
const GRID_OFFSET = HEADER_CLEAR + 40;
const VIEWPORT = 800;
const SCROLL_HEIGHT = 20_000;
const SCROLLER_TOP = 40;
const SAVED_TOP = 1000;
const REVEALED_TOP = 4321;

revealRowScrollTop.mockReturnValue(REVEALED_TOP);

function mountGrid({
	scrollTop = 0,
	measured = true,
}: { scrollTop?: number; measured?: boolean } = {}): HTMLElement {
	const scroller = document.createElement("div");
	const content = document.createElement("div");
	const grid = document.createElement("div");
	content.dataset.slot = "grid-content";
	content.style.paddingTop = `${HEADER_CLEAR}px`;
	content.style.paddingBottom = `${NAV_CLEAR}px`;
	grid.dataset.slot = "grid-cells";
	if (measured) {
		grid.style.gridTemplateColumns = Array(COLUMNS)
			.fill(`${CELL_PX}px`)
			.join(" ");
		grid.style.rowGap = `${ROW_STRIDE - CELL_PX}px`;
	}
	content.append(grid);
	scroller.append(document.createElement("div"), content);
	document.body.append(scroller);

	Object.defineProperties(scroller, {
		clientHeight: { value: VIEWPORT },
		scrollHeight: { value: SCROLL_HEIGHT },
		scrollTop: { value: scrollTop },
	});
	vi.spyOn(scroller, "getBoundingClientRect").mockReturnValue({
		top: SCROLLER_TOP,
	} as DOMRect);
	vi.spyOn(grid, "getBoundingClientRect").mockReturnValue({
		top: SCROLLER_TOP + GRID_OFFSET - scrollTop,
	} as DOMRect);
	return scroller;
}

afterEach(() => {
	document.body.replaceChildren();
	vi.clearAllMocks();
});

describe("revealedGridScrollTop", () => {
	it("keeps the saved offset for a profile the grid no longer lists", () => {
		expect(
			revealedGridScrollTop({
				scroller: mountGrid(),
				savedTop: SAVED_TOP,
				index: -1,
			}),
		).toBe(SAVED_TOP);
		expect(revealRowScrollTop).not.toHaveBeenCalled();
	});

	it("keeps the saved offset while the grid is unmeasured", () => {
		expect(
			revealedGridScrollTop({
				scroller: mountGrid({ measured: false }),
				savedTop: SAVED_TOP,
				index: 90,
			}),
		).toBe(SAVED_TOP);
		expect(revealRowScrollTop).not.toHaveBeenCalled();
	});

	it("reveals the profile's row, measured from the grid rather than the scroller's current offset", () => {
		expect(
			revealedGridScrollTop({
				scroller: mountGrid({ scrollTop: 500 }),
				savedTop: SAVED_TOP,
				index: 61,
			}),
		).toBe(REVEALED_TOP);
		expect(revealRowScrollTop).toHaveBeenCalledExactlyOnceWith({
			savedTop: SAVED_TOP,
			rowTopPx: GRID_OFFSET + 20 * ROW_STRIDE,
			rowHeightPx: CELL_PX,
			viewportPx: VIEWPORT,
			insetTopPx: HEADER_CLEAR,
			insetBottomPx: NAV_CLEAR,
			maxScrollTop: SCROLL_HEIGHT - VIEWPORT,
		});
	});
});
