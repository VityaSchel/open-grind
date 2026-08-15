import { vi } from "vitest";

vi.mock("$env/dynamic/public", () => ({ env: import.meta.env }));

// jsdom has no matchMedia, and svelte/motion reads it for reduced motion.
if (typeof window !== "undefined" && !window.matchMedia) {
	window.matchMedia = (query: string) =>
		({
			matches: false,
			media: query,
			onchange: null,
			addEventListener: () => {},
			removeEventListener: () => {},
			addListener: () => {},
			removeListener: () => {},
			dispatchEvent: () => false,
		}) as MediaQueryList;
}

// jsdom has no Web Animations either, and svelte/transition drives every
// transition through element.animate.
if (typeof Element !== "undefined" && !Element.prototype.animate) {
	Element.prototype.animate = () =>
		({
			cancel: () => {},
			finish: () => {},
			pause: () => {},
			play: () => {},
			reverse: () => {},
			addEventListener: () => {},
			removeEventListener: () => {},
			currentTime: 0,
			playState: "finished",
			effect: null,
			finished: Promise.resolve(),
			onfinish: null,
		}) as unknown as Animation;
}
