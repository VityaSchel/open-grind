// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
	loadWhenVisible,
	PREFETCH_MARGIN_PX,
	SETTLE_MS,
} from "./load-when-visible";

class FakeIntersectionObserver {
	static latest: FakeIntersectionObserver | null = null;
	#callback: IntersectionObserverCallback;
	#node: Element | null = null;

	constructor(callback: IntersectionObserverCallback) {
		this.#callback = callback;
		FakeIntersectionObserver.latest = this;
	}

	observe(node: Element) {
		this.#node = node;
	}

	deliver(where: "on-screen" | "prefetch" | "away") {
		this.#callback(
			[
				{
					isIntersecting: where !== "away",
					rootBounds: { top: -MARGIN, bottom: VIEWPORT + MARGIN },
					boundingClientRect:
						where === "on-screen"
							? { top: 100, bottom: 200 }
							: { top: VIEWPORT + 100, bottom: VIEWPORT + 200 },
					target: this.#node,
				} as unknown as IntersectionObserverEntry,
			],
			this as unknown as IntersectionObserver,
		);
	}

	unobserve() {}
	disconnect() {}
}

const MARGIN = PREFETCH_MARGIN_PX;
const VIEWPORT = 800;

let clock = 0;

function scrollBy(scroller: HTMLElement, distance: number, overMs: number) {
	Object.defineProperty(scroller, "scrollTop", {
		value: scroller.scrollTop + distance,
		configurable: true,
	});
	clock += overMs;
	scroller.dispatchEvent(new Event("scroll"));
}

function mount() {
	const scroller = document.createElement("div");
	scroller.style.overflowY = "auto";
	Object.defineProperty(scroller, "scrollTop", {
		value: 0,
		configurable: true,
	});
	const node = document.createElement("img");
	scroller.append(node);
	document.body.append(scroller);
	return { scroller, node };
}

describe("loadWhenVisible", () => {
	beforeEach(() => {
		clock = 0;
		vi.useFakeTimers();
		vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
		vi.spyOn(performance, "now").mockImplementation(() => clock);
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
		document.body.innerHTML = "";
		FakeIntersectionObserver.latest = null;
	});

	it("commits once the node comes into view", () => {
		const { node } = mount();
		const commit = vi.fn();

		loadWhenVisible(node, commit);
		FakeIntersectionObserver.latest?.deliver("on-screen");

		expect(commit).toHaveBeenCalledOnce();
	});

	it("never commits while the node stays out of view", () => {
		const { node } = mount();
		const commit = vi.fn();

		loadWhenVisible(node, commit);
		FakeIntersectionObserver.latest?.deliver("away");

		expect(commit).not.toHaveBeenCalled();
	});

	it("holds a prefetch back through a fling and issues it once scrolling settles", () => {
		const { scroller, node } = mount();
		const commit = vi.fn();
		loadWhenVisible(node, commit);

		scrollBy(scroller, 1000, 100);
		FakeIntersectionObserver.latest?.deliver("prefetch");
		expect(commit).not.toHaveBeenCalled();

		vi.advanceTimersByTime(SETTLE_MS);

		expect(commit).toHaveBeenCalledOnce();
	});

	it("loads what is already on screen without waiting for the fling to end", () => {
		const { scroller, node } = mount();
		const commit = vi.fn();
		loadWhenVisible(node, commit);

		scrollBy(scroller, 1000, 100);
		FakeIntersectionObserver.latest?.deliver("on-screen");

		expect(commit).toHaveBeenCalledOnce();
	});

	it("does not hold back a load during an ordinary scroll", () => {
		const { scroller, node } = mount();
		const commit = vi.fn();
		loadWhenVisible(node, commit);

		scrollBy(scroller, 50, 100);
		FakeIntersectionObserver.latest?.deliver("on-screen");

		expect(commit).toHaveBeenCalledOnce();
	});

	it("commits at most once", () => {
		const { node } = mount();
		const commit = vi.fn();

		loadWhenVisible(node, commit);
		FakeIntersectionObserver.latest?.deliver("on-screen");
		FakeIntersectionObserver.latest?.deliver("on-screen");

		expect(commit).toHaveBeenCalledOnce();
	});

	it("stops listening once destroyed", () => {
		const { scroller, node } = mount();
		const commit = vi.fn();

		const { destroy } = loadWhenVisible(node, commit);
		scrollBy(scroller, 1000, 100);
		FakeIntersectionObserver.latest?.deliver("prefetch");
		destroy();
		vi.advanceTimersByTime(SETTLE_MS);

		expect(commit).not.toHaveBeenCalled();
	});

	it("loads straight away where the browser cannot observe visibility", () => {
		const { node } = mount();
		const commit = vi.fn();
		vi.stubGlobal("IntersectionObserver", undefined);

		loadWhenVisible(node, commit);

		expect(commit).toHaveBeenCalledOnce();
	});

	it("observes nothing when there is no load to commit", () => {
		const { node } = mount();

		loadWhenVisible(node, undefined);

		expect(FakeIntersectionObserver.latest).toBeNull();
	});
});
