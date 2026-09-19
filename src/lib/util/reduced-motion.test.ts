import { linear } from "svelte/easing";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TransitionConfig } from "svelte/transition";

import {
	fadeWhenReducedMotion,
	fly,
	instantWhenReducedMotion,
	preferredScrollBehavior,
	slide,
} from "./reduced-motion";

const reducedMotion = vi.hoisted(() => ({ current: false }));

vi.mock("svelte/motion", () => ({ prefersReducedMotion: reducedMotion }));

function sliding(node: HTMLElement, { distance }: { distance: number }) {
	void node;
	return {
		delay: 20,
		duration: 300,
		easing: linear,
		css: (t: number) => `transform: translateY(${(1 - t) * distance}px)`,
	} satisfies TransitionConfig;
}

afterEach(() => {
	reducedMotion.current = false;
	document.body.replaceChildren();
});

function element(opacity = "1"): HTMLElement {
	const node = document.createElement("div");
	node.style.opacity = opacity;
	document.body.append(node);
	return node;
}

describe("fadeWhenReducedMotion", () => {
	it("returns the motion transition untouched without reduced motion", () => {
		const transition = fadeWhenReducedMotion(sliding);
		const config = transition(element(), { distance: 40 });
		expect(config.css?.(0, 1)).toBe("transform: translateY(40px)");
		expect(config.duration).toBe(300);
	});

	it("keeps the timing but fades opacity only under reduced motion", () => {
		reducedMotion.current = true;
		const transition = fadeWhenReducedMotion(sliding);
		const config = transition(element("0.8"), { distance: 40 });
		expect(config).toMatchObject({
			delay: 20,
			duration: 300,
			easing: linear,
		});
		expect(config.css?.(0.5, 0.5)).toBe("opacity: 0.4");
		expect(config.css?.(1, 0)).toBe("opacity: 0.8");
	});

	it("reads the preference when each transition starts", () => {
		const node = element();
		expect(fly(node, { y: 48 }).css?.(0, 1)).toContain("transform");
		reducedMotion.current = true;
		expect(fly(node, { y: 48 }).css?.(0, 1)).toBe("opacity: 0");
	});
});

describe("instantWhenReducedMotion", () => {
	it("returns the collapse untouched without reduced motion", () => {
		const transition = instantWhenReducedMotion(sliding);
		expect(transition(element(), { distance: 40 }).duration).toBe(300);
	});

	it("lets a collapse happen at once under reduced motion, so nothing waits behind an invisible gap", () => {
		reducedMotion.current = true;
		expect(slide(element()).duration).toBe(0);
		expect(slide(element()).css).toBeUndefined();
	});
});

describe("preferredScrollBehavior", () => {
	it("scrolls smoothly without reduced motion", () => {
		expect(preferredScrollBehavior()).toBe("smooth");
	});

	it("jumps instantly under reduced motion", () => {
		reducedMotion.current = true;
		expect(preferredScrollBehavior()).toBe("instant");
	});
});
