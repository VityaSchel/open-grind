import { flushSync } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
	bottomChrome,
	bottomChromeClearance,
	remeasureScreenChrome,
	topChrome,
	topChromeClearance,
} from "./screen-chrome.svelte";

const VIEWPORT_HEIGHT = 800;

function bar({ top, height }: { top: number; height: number }) {
	const element = document.createElement("nav");
	element.style.padding = "0px";
	element.getBoundingClientRect = () =>
		({ top, bottom: top + height, height }) as DOMRect;
	element.getClientRects = () => [{}] as unknown as DOMRectList;
	document.body.append(element);
	return element;
}

beforeEach(() => {
	vi.stubGlobal("innerHeight", VIEWPORT_HEIGHT);
	vi.stubGlobal(
		"ResizeObserver",
		class {
			observe() {}
			disconnect() {}
		},
	);
});

afterEach(() => {
	vi.unstubAllGlobals();
	document.body.replaceChildren();
});

describe("screen chrome clearance", () => {
	it("clears a top bar down to its bottom edge and a bottom bar up to its top edge", () => {
		const detachTop = topChrome(bar({ top: 0, height: 76 }));
		const detachBottom = bottomChrome(bar({ top: 736, height: 64 }));
		remeasureScreenChrome();
		flushSync();

		expect(topChromeClearance()).toBe(76);
		expect(bottomChromeClearance()).toBe(64);
		detachTop?.();
		detachBottom?.();
	});

	it("keeps counting a bar in an inert pane that is still on screen", () => {
		const pane = document.createElement("div");
		pane.setAttribute("inert", "");
		document.body.append(pane);
		const navBar = bar({ top: 736, height: 64 });
		pane.append(navBar);
		const detach = bottomChrome(navBar);
		remeasureScreenChrome();
		flushSync();

		expect(bottomChromeClearance()).toBe(64);
		detach?.();
	});

	it("ignores a bar inside a leaving pane until the pane stays", () => {
		const pane = document.createElement("div");
		pane.setAttribute("data-leaving", "");
		document.body.append(pane);
		const navBar = bar({ top: 736, height: 64 });
		pane.append(navBar);
		const detach = bottomChrome(navBar);
		remeasureScreenChrome();
		flushSync();
		expect(bottomChromeClearance()).toBe(0);

		pane.removeAttribute("data-leaving");
		remeasureScreenChrome();
		flushSync();
		expect(bottomChromeClearance()).toBe(64);
		detach?.();
	});

	it("ignores a bar under a hidden pane until the pane shows again", () => {
		const pane = document.createElement("div");
		pane.style.visibility = "hidden";
		document.body.append(pane);
		const navBar = bar({ top: 0, height: 76 });
		pane.append(navBar);
		const detach = topChrome(navBar);
		remeasureScreenChrome();
		flushSync();
		expect(topChromeClearance()).toBe(0);

		pane.style.visibility = "";
		remeasureScreenChrome();
		flushSync();
		expect(topChromeClearance()).toBe(76);
		detach?.();
	});
});
