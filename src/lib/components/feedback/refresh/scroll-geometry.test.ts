import { afterEach, describe, expect, it, vi } from "vitest";

import type { PullPosition } from "./scroll-chain";
import { edgeGap, scrollGeometry } from "./scroll-geometry";

function scroller({
	scrollHeight,
	clientHeight,
	scrollTop,
}: {
	scrollHeight: number;
	clientHeight: number;
	scrollTop: number;
}) {
	const el = document.createElement("div");
	const scroll = vi.fn();
	Object.defineProperties(el, {
		scrollHeight: { value: scrollHeight, configurable: true },
		clientHeight: { value: clientHeight, configurable: true },
		scroll: { value: scroll, configurable: true },
	});
	el.scrollTop = scrollTop;
	return { el, scroll };
}

function geometryOf({
	el,
	position,
}: {
	el: HTMLElement;
	position: PullPosition;
}) {
	return scrollGeometry({ container: () => el, position: () => position });
}

describe("edgeGap", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it.each([
		{ devicePixelRatio: 1, rawGap: 0, gap: 0 },
		{ devicePixelRatio: 1, rawGap: 2, gap: 0 },
		{ devicePixelRatio: 1, rawGap: -2, gap: 0 },
		{ devicePixelRatio: 1, rawGap: 2.01, gap: 2.01 },
		{ devicePixelRatio: 1, rawGap: -2.01, gap: -2.01 },
		{ devicePixelRatio: 1.25, rawGap: 1, gap: 0 },
		{ devicePixelRatio: 1.25, rawGap: 1.8, gap: 0 },
		{ devicePixelRatio: 1.25, rawGap: -1.8, gap: 0 },
		{ devicePixelRatio: 1.25, rawGap: 1.81, gap: 1.81 },
		{ devicePixelRatio: 1.25, rawGap: -1.81, gap: -1.81 },
		{ devicePixelRatio: 2.625, rawGap: 1.14, gap: 0 },
		{ devicePixelRatio: 2.625, rawGap: 1.38, gap: 0 },
		{ devicePixelRatio: 2.625, rawGap: -1.38, gap: 0 },
		{ devicePixelRatio: 2.625, rawGap: 1.39, gap: 1.39 },
		{ devicePixelRatio: 2.625, rawGap: -1.39, gap: -1.39 },
	])(
		"reads $rawGap px at a device pixel ratio of $devicePixelRatio as $gap px",
		({ devicePixelRatio, rawGap, gap }) => {
			vi.stubGlobal("devicePixelRatio", devicePixelRatio);
			expect(edgeGap(rawGap)).toBe(gap);
		},
	);

	it("follows the device pixel ratio as it changes", () => {
		vi.stubGlobal("devicePixelRatio", 1.25);
		expect(edgeGap(1.6)).toBe(0);
		vi.stubGlobal("devicePixelRatio", 2.625);
		expect(edgeGap(1.6)).toBe(1.6);
	});
});

describe("scrollGeometry", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("puts a conversation whose floor rounds a whole pixel below its range on the floor", () => {
		vi.stubGlobal("devicePixelRatio", 1.25);
		const { el } = scroller({
			scrollHeight: 1167,
			clientHeight: 674,
			scrollTop: 492,
		});
		const geometry = geometryOf({ el, position: "bottom" });

		expect(geometry.boundaryDistance()).toBe(0);
		expect(geometry.overscrollPx()).toBeCloseTo(0);
	});

	it("keeps a reader scrolled up from the floor and a rubber band past it as they are", () => {
		vi.stubGlobal("devicePixelRatio", 1.25);
		const { el } = scroller({
			scrollHeight: 1167,
			clientHeight: 674,
			scrollTop: 480,
		});
		const geometry = geometryOf({ el, position: "bottom" });
		expect(geometry.boundaryDistance()).toBe(13);
		expect(geometry.overscrollPx()).toBe(-13);

		el.scrollTop = 497;
		expect(geometry.boundaryDistance()).toBe(-4);
		expect(geometry.overscrollPx()).toBe(4);
	});

	it("leaves the top edge exact", () => {
		vi.stubGlobal("devicePixelRatio", 1.25);
		const { el } = scroller({
			scrollHeight: 1167,
			clientHeight: 674,
			scrollTop: 1.6,
		});
		const geometry = geometryOf({ el, position: "top" });

		expect(geometry.boundaryDistance()).toBe(1.6);
		expect(geometry.overscrollPx()).toBe(-1.6);
	});

	it.each([
		{ position: "bottom" as const, top: 1167 },
		{ position: "top" as const, top: 0 },
	])(
		"rests at the $position by letting the engine clamp a scroll to $top",
		({ position, top }) => {
			const { el, scroll } = scroller({
				scrollHeight: 1167,
				clientHeight: 674,
				scrollTop: 300,
			});

			geometryOf({ el, position }).scrollToRest();

			expect(scroll).toHaveBeenCalledWith({ top, behavior: "instant" });
		},
	);
});
