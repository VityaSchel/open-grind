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
