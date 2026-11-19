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
	it("steps a line, most of a view or all the way as the move asks, whatever the key", () => {
		const { element, scrollTo } = scroller({ top: 200 });

		for (const [key, step, edge] of [
			["ArrowDown", "line", "down"],
			["PageDown", "page", "down"],
			[" ", "page", "down"],
			["Home", "end", "up"],
			["ArrowDown", "end", "down"],
		] as const)
			scrollTowardEdge({
				event: press(key),
				edge,
				step,
				scroller: element,
			});

		expect(scrollTo.mock.calls.map(([options]) => options.top)).toEqual([
			240, 550, 550, 0, 600,
		]);
	});

	it("claims the key only when it scrolls, so the browser keeps the key at the very edge", () => {
		const { element, scrollTo } = scroller({ top: 0 });
		const atEdge = press("ArrowUp");
		const inside = press("ArrowDown");

		scrollTowardEdge({
			event: atEdge,
			edge: "up",
			step: "line",
			scroller: element,
		});
		scrollTowardEdge({
			event: inside,
			edge: "down",
			step: "line",
			scroller: element,
		});

		expect(atEdge.defaultPrevented).toBe(false);
		expect(inside.defaultPrevented).toBe(true);
		expect(scrollTo).toHaveBeenCalledTimes(1);
	});

	it("claims Home and End at a sideways edge with no room, where the browser would scroll the page instead", () => {
		const { element, scrollTo } = scroller({ left: 0 });
		const home = press("Home");
		const arrow = press("ArrowLeft");

		scrollTowardEdge({
			event: home,
			edge: "left",
			step: "end",
			scroller: element,
		});
		scrollTowardEdge({
			event: arrow,
			edge: "left",
			step: "line",
			scroller: element,
		});

		expect(home.defaultPrevented).toBe(true);
		expect(arrow.defaultPrevented).toBe(false);
		expect(scrollTo).not.toHaveBeenCalled();
	});

	it("stops at the far end instead of overshooting", () => {
		const { element, scrollTo } = scroller({ top: 590 });

		scrollTowardEdge({
			event: press("ArrowDown"),
			edge: "down",
			step: "line",
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
			step: "line",
			scroller: element,
		});
		scrollTowardEdge({
			event: press("End"),
			edge: "left",
			step: "end",
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
