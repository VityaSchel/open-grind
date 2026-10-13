// @vitest-environment jsdom

import { cleanup, fireEvent, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { GaymojiItem } from "$lib/api/messaging/gaymoji";
import GaymojiTile from "./GaymojiTile.svelte";

const gaymoji: GaymojiItem = {
	id: "1_2_Yass.png",
	label: "Yass",
	imageUrl: "data:image/png;base64,Yass",
	imageHash: "gaymoji/1_2_Yass.png",
};

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

	enter() {
		this.#callback(
			[
				{
					isIntersecting: true,
					target: this.#node,
				} as unknown as IntersectionObserverEntry,
			],
			this as unknown as IntersectionObserver,
		);
	}

	unobserve() {}
	disconnect() {}
}

function mountTile() {
	vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
	const { container } = render(GaymojiTile, {
		props: { gaymoji, selected: false, onclick: () => {} },
	});
	return container.querySelector("img")!;
}

async function comeIntoView(image: HTMLImageElement) {
	FakeIntersectionObserver.latest!.enter();
	await Promise.resolve();
	return image;
}

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	FakeIntersectionObserver.latest = null;
});

describe("Gaymoji tile", () => {
	it("holds a still muted tone while out of view", () => {
		const image = mountTile();

		expect(image.getAttribute("src")).not.toBe(gaymoji.imageUrl);
		expect(image.classList).toContain("bg-muted");
		expect(image.classList).not.toContain("animate-pulse");
	});

	it("pulses only while its image is loading", async () => {
		const image = await comeIntoView(mountTile());

		expect(image.getAttribute("src")).toBe(gaymoji.imageUrl);
		expect(image.classList).toContain("bg-muted");
		expect(image.classList).toContain("animate-pulse");
	});

	it("drops the tone once loaded so the transparent PNG shows through", async () => {
		const image = await comeIntoView(mountTile());
		Object.defineProperty(image, "naturalWidth", { get: () => 256 });

		await fireEvent.load(image);

		expect(image.classList).not.toContain("bg-muted");
		expect(image.classList).not.toContain("animate-pulse");
		expect(image.classList).toContain("object-contain");
	});
});
