import { afterEach, describe, expect, it, vi } from "vitest";

import { scrollTowardEdge, stopScrollAnimation } from "./scroll-keys";

afterEach(() => {
	vi.restoreAllMocks();
});

function scroller({
	top = 0,
	left = 0,
	direction = "ltr",
}: { top?: number; left?: number; direction?: string } = {}) {
	const element = document.createElement("div");
	element.style.direction = direction;
	document.body.append(element);
	Object.defineProperties(element, {
		clientHeight: { value: 400 },
		scrollHeight: { value: 1000 },
		clientWidth: { value: 300 },
		scrollWidth: { value: 500 },
		scrollTop: { value: top, writable: true },
		scrollLeft: { value: left, writable: true },
	});
	const scrollTo = vi.fn();
	element.scrollTo = scrollTo as typeof element.scrollTo;
	return { element, scrollTo };
}

function press(key: string): KeyboardEvent {
	return new KeyboardEvent("keydown", { key, cancelable: true });
}

describe("scrollTowardEdge", () => {
	it("steps a line for an arrow, most of a view for a page key and all the way for Home and End", () => {
		const { element, scrollTo } = scroller({ top: 200 });

		for (const [key, edge] of [
			["ArrowDown", "down"],
			["PageDown", "down"],
			["Home", "up"],
		] as const)
			scrollTowardEdge({ event: press(key), edge, scroller: element });

		expect(scrollTo.mock.calls.map(([options]) => options.top)).toEqual([
			240, 550, 0,
		]);
	});

	it("claims the key only when it scrolls, so the browser keeps the key at the very edge", () => {
		const { element, scrollTo } = scroller({ top: 0 });
		const atEdge = press("ArrowUp");
		const inside = press("ArrowDown");

		scrollTowardEdge({ event: atEdge, edge: "up", scroller: element });
		scrollTowardEdge({ event: inside, edge: "down", scroller: element });

		expect(atEdge.defaultPrevented).toBe(false);
		expect(inside.defaultPrevented).toBe(true);
		expect(scrollTo).toHaveBeenCalledTimes(1);
	});

	it("stops at the far end instead of overshooting", () => {
		const { element, scrollTo } = scroller({ top: 590 });

		scrollTowardEdge({
			event: press("ArrowDown"),
			edge: "down",
			scroller: element,
		});

		expect(scrollTo).toHaveBeenCalledWith(
			expect.objectContaining({ top: 600 }),
		);
	});

	it("scrolls right-to-left lists toward the physical edge pressed", () => {
		const { element, scrollTo } = scroller({
			left: -100,
			direction: "rtl",
		});

		scrollTowardEdge({
			event: press("ArrowRight"),
			edge: "right",
			scroller: element,
		});
		scrollTowardEdge({
			event: press("End"),
			edge: "left",
			scroller: element,
		});

		expect(scrollTo.mock.calls.map(([options]) => options.left)).toEqual([
			-60, -200,
		]);
	});
});

describe("stopScrollAnimation", () => {
	it("pins the scroller where it is right now", () => {
		const { element, scrollTo } = scroller({ top: 123, left: 4 });

		stopScrollAnimation(element);

		expect(scrollTo).toHaveBeenCalledWith({
			top: 123,
			left: 4,
			behavior: "instant",
		});
	});
});
