// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const motion = vi.hoisted(() => ({ reduced: false }));

vi.mock("svelte/motion", () => ({
	prefersReducedMotion: {
		get current() {
			return motion.reduced;
		},
	},
}));

import { resetPlatform, runningOn } from "#lib/test/platform.ts";
import {
	followInsertionsAbove,
	glidingToTop,
	jumpThenGlideToTop,
	stopGlidingToTop,
} from "./scroll";

const SCREEN_HEIGHT = 800;
const GLIDE_MS = 400;
const FRAME_MS = 16;

function scrolledList(scrollTop: number): HTMLElement {
	const element = document.createElement("div");
	Object.defineProperty(element, "clientHeight", { value: SCREEN_HEIGHT });
	element.scrollTop = scrollTop;
	document.body.append(element);
	return element;
}

beforeEach(() => {
	vi.useFakeTimers({
		toFake: [
			"requestAnimationFrame",
			"cancelAnimationFrame",
			"performance",
		],
	});
	runningOn("android");
});

afterEach(() => {
	vi.useRealTimers();
	resetPlatform();
	document.body.replaceChildren();
	motion.reduced = false;
	vi.restoreAllMocks();
});

describe("followInsertionsAbove", () => {
	it("reads how far content inserted above the anchor pushed it down", () => {
		const scroller = scrolledList(0);
		const anchor = document.createElement("p");
		scroller.append(anchor);
		let anchorTop = 140;
		vi.spyOn(scroller, "getBoundingClientRect").mockReturnValue(
			new DOMRect(0, 62, 402, 778),
		);
		vi.spyOn(anchor, "getBoundingClientRect").mockImplementation(
			() => new DOMRect(0, anchorTop, 402, 40),
		);

		const landing = followInsertionsAbove({ scroller, anchor });
		expect(landing()).toBe(0);

		anchorTop += 300;
		expect(landing()).toBe(300);
		scroller.scrollTop = 300;
		anchorTop -= 300;
		expect(landing(), "holding the anchor in view changes nothing").toBe(
			300,
		);

		anchor.remove();
		expect(landing(), "a removed anchor keeps the last landing").toBe(300);
	});
});

describe("jumpThenGlideToTop", () => {
	it("jumps to a screen above the top, glides the rest and lets go of the list at the top", () => {
		const list = scrolledList(5000);

		jumpThenGlideToTop({ element: list });
		expect(list.scrollTop).toBe(SCREEN_HEIGHT);
		expect(glidingToTop(list)).toBe(true);

		vi.advanceTimersByTime(GLIDE_MS);
		expect(list.scrollTop).toBe(0);
		expect(glidingToTop(list)).toBe(false);
	});

	it("glides without a jump when the top is less than a screen away", () => {
		const list = scrolledList(500);

		jumpThenGlideToTop({ element: list });
		expect(list.scrollTop).toBe(500);

		vi.advanceTimersByTime(GLIDE_MS);
		expect(list.scrollTop).toBe(0);
	});

	it("starts the glide fast and slows into the top", () => {
		const list = scrolledList(SCREEN_HEIGHT);

		jumpThenGlideToTop({ element: list });
		vi.advanceTimersByTime(GLIDE_MS / 4);
		const firstQuarter = SCREEN_HEIGHT - list.scrollTop;
		vi.advanceTimersByTime(GLIDE_MS / 2);
		const lastQuarterStart = list.scrollTop;
		vi.advanceTimersByTime(GLIDE_MS / 4);

		expect(firstQuarter).toBeGreaterThan(SCREEN_HEIGHT / 3);
		expect(lastQuarterStart).toBeLessThan(SCREEN_HEIGHT / 30);
		expect(list.scrollTop).toBe(0);
	});

	it("keeps gliding toward a landing that content inserted above pushes down", () => {
		const list = scrolledList(500);
		let inserted = 0;

		jumpThenGlideToTop({ element: list, landing: () => inserted });
		vi.advanceTimersByTime(GLIDE_MS / 2);
		const halfway = list.scrollTop;
		inserted = 300;
		list.scrollTop += inserted;
		vi.advanceTimersByTime(FRAME_MS);

		expect(list.scrollTop).toBeGreaterThan(inserted);
		expect(list.scrollTop).toBeLessThan(halfway + inserted);
		vi.advanceTimersByTime(GLIDE_MS);
		expect(list.scrollTop).toBe(inserted);
	});

	it("lets a new glide on the same list replace the running one", () => {
		const list = scrolledList(5000);

		jumpThenGlideToTop({ element: list });
		vi.advanceTimersByTime(GLIDE_MS / 4);
		jumpThenGlideToTop({ element: list, landing: () => 40 });
		expect(vi.getTimerCount()).toBe(1);
		vi.advanceTimersByTime(GLIDE_MS + FRAME_MS);

		expect(list.scrollTop).toBe(40);
	});

	for (const takeover of ["touchstart", "wheel"]) {
		it(`hands the list back on ${takeover}`, () => {
			const list = scrolledList(5000);

			jumpThenGlideToTop({ element: list });
			vi.advanceTimersByTime(GLIDE_MS / 4);
			list.dispatchEvent(new Event(takeover));
			const handedBack = list.scrollTop;
			vi.advanceTimersByTime(GLIDE_MS);

			expect(list.scrollTop).toBe(handedBack);
			expect(glidingToTop(list)).toBe(false);
		});
	}

	it("stops on request where the list stands", () => {
		const list = scrolledList(5000);

		jumpThenGlideToTop({ element: list });
		stopGlidingToTop(list);
		vi.advanceTimersByTime(GLIDE_MS);

		expect(list.scrollTop).toBe(SCREEN_HEIGHT);
		expect(glidingToTop(list)).toBe(false);
	});

	it("lands at once with reduced motion", () => {
		motion.reduced = true;
		const list = scrolledList(5000);

		jumpThenGlideToTop({ element: list });

		expect(list.scrollTop).toBe(0);
		expect(glidingToTop(list)).toBe(false);
	});
});
