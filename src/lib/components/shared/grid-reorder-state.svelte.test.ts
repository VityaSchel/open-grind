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
