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
import { glidingToTop, jumpThenGlideToTop, stopGlidingToTop } from "./scroll";

const SCREEN_HEIGHT = 800;
const GLIDE_MS = 400;

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
});

describe("jumpThenGlideToTop", () => {
	it("jumps to a screen above the top, glides the rest and reports the landing", () => {
		const list = scrolledList(5000);
		const onLanded = vi.fn();

		jumpThenGlideToTop({ element: list, onLanded });
		expect(list.scrollTop).toBe(SCREEN_HEIGHT);
		expect(glidingToTop(list)).toBe(true);

		vi.advanceTimersByTime(GLIDE_MS);
		expect(list.scrollTop).toBe(0);
		expect(glidingToTop(list)).toBe(false);
		expect(onLanded).toHaveBeenCalledOnce();
	});

	it("keeps gliding toward a landing that content inserted above pushes down", () => {
		const list = scrolledList(500);
		let inserted = 0;

		jumpThenGlideToTop({ element: list, landing: () => inserted });
		vi.advanceTimersByTime(GLIDE_MS / 2);
		const halfway = list.scrollTop;
		inserted = 300;
		list.scrollTop += inserted;
		vi.advanceTimersByTime(16);

		expect(list.scrollTop).toBeGreaterThan(inserted);
		expect(list.scrollTop).toBeLessThan(halfway + inserted);
		vi.advanceTimersByTime(GLIDE_MS);
		expect(list.scrollTop).toBe(inserted);
	});

	it("lets a new glide on the same list replace the running one", () => {
		const list = scrolledList(5000);
		const firstLanded = vi.fn();

		jumpThenGlideToTop({ element: list, onLanded: firstLanded });
		vi.advanceTimersByTime(GLIDE_MS / 4);
		jumpThenGlideToTop({ element: list, landing: () => 40 });
		vi.advanceTimersByTime(GLIDE_MS);

		expect(list.scrollTop).toBe(40);
		expect(firstLanded).not.toHaveBeenCalled();
	});

	for (const takeover of ["touchstart", "wheel"]) {
		it(`hands the list back on ${takeover}`, () => {
			const list = scrolledList(5000);
			const onLanded = vi.fn();

			jumpThenGlideToTop({ element: list, onLanded });
			vi.advanceTimersByTime(GLIDE_MS / 4);
			list.dispatchEvent(new Event(takeover));
			const handedBack = list.scrollTop;
			vi.advanceTimersByTime(GLIDE_MS);

			expect(list.scrollTop).toBe(handedBack);
			expect(glidingToTop(list)).toBe(false);
			expect(onLanded).not.toHaveBeenCalled();
		});
	}

	it("stops on request without reporting a landing", () => {
		const list = scrolledList(5000);
		const onLanded = vi.fn();

		jumpThenGlideToTop({ element: list, onLanded });
		stopGlidingToTop(list);
		vi.advanceTimersByTime(GLIDE_MS);

		expect(list.scrollTop).toBe(SCREEN_HEIGHT);
		expect(onLanded).not.toHaveBeenCalled();
	});

	it("lands at once with reduced motion", () => {
		motion.reduced = true;
		const list = scrolledList(5000);
		const onLanded = vi.fn();

		jumpThenGlideToTop({ element: list, onLanded });

		expect(list.scrollTop).toBe(0);
		expect(glidingToTop(list)).toBe(false);
		expect(onLanded).toHaveBeenCalledOnce();
	});
});
