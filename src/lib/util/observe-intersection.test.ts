// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { observeIntersection } from "./observe-intersection";

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

	deliver(intersections: boolean[]) {
		this.#callback(
			intersections.map(
				(isIntersecting) =>
					({
						isIntersecting,
						target: this.#node,
					}) as unknown as IntersectionObserverEntry,
			),
			this as unknown as IntersectionObserver,
		);
	}

	disconnect() {}
}

function observed() {
	const handle = vi.fn();
	const { destroy } = observeIntersection(document.createElement("div"), {
		handle,
	});
	const observer = FakeIntersectionObserver.latest;
	if (observer === null) throw new Error("nothing is observed");
	return { handle, observer, destroy };
}

beforeEach(() => {
	vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("observeIntersection", () => {
	it("fires when a batch ends inside the view", () => {
		const { handle, observer, destroy } = observed();

		observer.deliver([false, true]);

		expect(handle).toHaveBeenCalledOnce();
		destroy();
	});

	it("stays quiet when a batch ends outside the view", () => {
		const { handle, observer, destroy } = observed();

		observer.deliver([true, false]);

		expect(handle).not.toHaveBeenCalled();
		destroy();
	});
});
