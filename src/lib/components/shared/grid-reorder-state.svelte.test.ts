import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { playHapticMock } = vi.hoisted(() => ({ playHapticMock: vi.fn() }));
vi.mock("$lib/haptics", () => ({ playHaptic: playHapticMock }));

import { GridReorderState } from "./grid-reorder-state.svelte";

const CELL_PX = 100;

function fakeCell(column: number): HTMLElement {
	return {
		getBoundingClientRect: () => ({
			left: column * CELL_PX,
			top: 0,
			width: CELL_PX,
			height: CELL_PX,
		}),
		addEventListener: () => {},
		removeEventListener: () => {},
		setPointerCapture: () => {},
	} as unknown as HTMLElement;
}

function pointer({
	pointerType,
	node,
	x = 50,
}: {
	pointerType: string;
	node: HTMLElement;
	x?: number;
}): PointerEvent {
	return {
		button: 0,
		pointerId: 1,
		pointerType,
		clientX: x,
		clientY: 50,
		currentTarget: node,
	} as unknown as PointerEvent;
}

function gridOfTwo() {
	const reorder = new GridReorderState({ onReorder: () => {} });
	const first = fakeCell(0);
	const detach = [first, fakeCell(1)].map((cell, index) =>
		reorder.cell(index)(cell),
	);
	return { reorder, first, detach };
}

beforeEach(() => {
	vi.useFakeTimers();
	playHapticMock.mockReset();
});

afterEach(() => {
	vi.useRealTimers();
});

describe("GridReorderState haptics", () => {
	it("taps once when a touch hold lifts a cell", () => {
		const { reorder, first } = gridOfTwo();

		reorder.press({
			event: pointer({ pointerType: "touch", node: first }),
			index: 0,
		});
		vi.advanceTimersByTime(300);
		reorder.move(pointer({ pointerType: "touch", node: first, x: 150 }));

		expect(reorder.dragging).toBe(true);
		expect(playHapticMock).toHaveBeenCalledExactlyOnceWith("dragStart");
	});

	it("taps when a pen hold lifts a cell", () => {
		const { reorder, first } = gridOfTwo();

		reorder.press({
			event: pointer({ pointerType: "pen", node: first }),
			index: 0,
		});
		vi.advanceTimersByTime(300);

		expect(playHapticMock).toHaveBeenCalledExactlyOnceWith("dragStart");
	});

	it("stays quiet when a mouse drag lifts a cell", () => {
		const { reorder, first } = gridOfTwo();

		reorder.press({
			event: pointer({ pointerType: "mouse", node: first }),
			index: 0,
		});
		reorder.move(pointer({ pointerType: "mouse", node: first, x: 150 }));
		vi.advanceTimersByTime(300);

		expect(reorder.dragging).toBe(true);
		expect(playHapticMock).not.toHaveBeenCalled();
	});

	it("stays quiet when a touch moves away before the hold lifts", () => {
		const { reorder, first } = gridOfTwo();

		reorder.press({
			event: pointer({ pointerType: "touch", node: first }),
			index: 0,
		});
		reorder.move(pointer({ pointerType: "touch", node: first, x: 80 }));
		vi.advanceTimersByTime(300);

		expect(reorder.dragging).toBe(false);
		expect(playHapticMock).not.toHaveBeenCalled();
	});

	it("stays quiet when the held cell is gone by the time the hold lifts", () => {
		const { reorder, first, detach } = gridOfTwo();

		reorder.press({
			event: pointer({ pointerType: "touch", node: first }),
			index: 0,
		});
		for (const release of detach) release?.();
		vi.advanceTimersByTime(300);

		expect(reorder.dragging).toBe(false);
		expect(playHapticMock).not.toHaveBeenCalled();
	});
});

describe("GridReorderState preview at a fractional device pixel ratio", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("moves every displaced cell by whole device pixels", () => {
		const devicePixelRatio = 2.8125;
		vi.stubGlobal("devicePixelRatio", devicePixelRatio);
		const reorder = new GridReorderState({ onReorder: () => {} });
		const first = fakeCell(0);
		[first, fakeCell(1), fakeCell(2)].forEach((cell, index) =>
			reorder.cell(index)(cell),
		);
		reorder.press({
			event: pointer({ pointerType: "mouse", node: first }),
			index: 0,
		});
		reorder.move(pointer({ pointerType: "mouse", node: first, x: 70 }));
		reorder.move(pointer({ pointerType: "mouse", node: first, x: 250 }));
		expect(reorder.to).toBe(2);

		const translations = [1, 2].flatMap((index) => {
			const match = /translate\((.+)px, (.+)px\)/.exec(
				reorder.transformFor(index) ?? "",
			);
			return match ? [Number(match[1]), Number(match[2])] : [];
		});
		expect(translations).toHaveLength(4);
		expect(translations.some((length) => length !== 0)).toBe(true);
		for (const length of translations) {
			const devicePixels = length * devicePixelRatio;
			expect(devicePixels).toBeCloseTo(Math.round(devicePixels), 6);
		}
	});
});

function scrollingGrid({ cells }: { cells: number }) {
	const page = { scrolled: 0 };
	const box = ({ left, top }: { left: number; top: number }) => ({
		getBoundingClientRect: () => ({
			left,
			top: top - page.scrolled,
			width: CELL_PX,
			height: CELL_PX,
		}),
		addEventListener: () => {},
		removeEventListener: () => {},
		setPointerCapture: () => {},
	});
	const moves: { from: number; to: number }[] = [];
	const reorder = new GridReorderState({
		onReorder: (move) => moves.push(move),
	});
	reorder.grid(box({ left: 0, top: 0 }) as unknown as HTMLElement);
	const nodes = Array.from({ length: cells }, (_, index) => {
		const node = box({
			left: (index % 3) * CELL_PX,
			top: Math.floor(index / 3) * CELL_PX,
		}) as unknown as HTMLElement;
		reorder.cell(index)(node);
		return node;
	});
	const scrollBy = (distance: number) => {
		page.scrolled += distance;
		document.body.dispatchEvent(new Event("scroll"));
	};
	const pointerAt = ({ x, y }: { x: number; y: number }) =>
		({
			button: 0,
			pointerId: 1,
			pointerType: "mouse",
			clientX: x,
			clientY: y,
			currentTarget: nodes[0],
		}) as unknown as PointerEvent;
	const liftFirstCell = () => {
		reorder.press({ event: pointerAt({ x: 50, y: 50 }), index: 0 });
		reorder.move(pointerAt({ x: 65, y: 50 }));
	};
	return { reorder, moves, scrollBy, pointerAt, liftFirstCell };
}

describe("GridReorderState while the page scrolls under a held cell", () => {
	it("aims at the slot that scrolled under a still pointer", () => {
		const { reorder, moves, scrollBy, pointerAt, liftFirstCell } =
			scrollingGrid({ cells: 6 });
		liftFirstCell();
		reorder.move(pointerAt({ x: 250, y: 50 }));
		expect(reorder.to).toBe(2);

		scrollBy(CELL_PX);

		expect(reorder.to, "the slot a row below now sits there").toBe(5);
		expect(
			reorder.transformFor(0),
			"the held cell stays under the pointer",
		).toBe("translate(185px, 100px)");
		reorder.release();
		expect(moves).toEqual([{ from: 0, to: 5 }]);
	});

	it("drops the cell where the pointer lets go after the page scrolled", () => {
		const { reorder, moves, scrollBy, pointerAt, liftFirstCell } =
			scrollingGrid({ cells: 6 });
		liftFirstCell();
		scrollBy(CELL_PX);
		reorder.move(pointerAt({ x: 150, y: 50 }));
		reorder.release();

		expect(moves).toEqual([{ from: 0, to: 4 }]);
	});
});
