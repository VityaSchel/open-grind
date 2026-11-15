// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import SplashIcon from "./SplashIcon.svelte";

afterEach(cleanup);

function paths(container: HTMLElement) {
	return [...container.querySelectorAll("path")];
}

describe("SplashIcon", () => {
	it("draws the fill weight as one filled silhouette", () => {
		const { container } = render(SplashIcon, { props: { weight: "fill" } });

		const [silhouette, ...rest] = paths(container);
		expect(rest).toHaveLength(0);
		expect(silhouette?.getAttribute("fill")).toBe("currentColor");
		expect(silhouette?.hasAttribute("stroke")).toBe(false);
	});

	it.each([
		["thin", "8"],
		["light", "12"],
		["regular", "16"],
		["bold", "24"],
	] as const)("strokes the %s weight %s units wide", (weight, width) => {
		const { container } = render(SplashIcon, { props: { weight } });

		const [outline, ...rest] = paths(container);
		expect(rest).toHaveLength(0);
		expect(outline?.getAttribute("fill")).toBe("none");
		expect(outline?.getAttribute("stroke-width")).toBe(width);
	});

	it("puts a faint fill under the regular outline for duotone", () => {
		const { container } = render(SplashIcon, {
			props: { weight: "duotone" },
		});

		const [tint, outline] = paths(container);
		expect(tint?.getAttribute("opacity")).toBe("0.2");
		expect(outline?.getAttribute("stroke-width")).toBe("16");
		expect(tint?.getAttribute("d")).toBe(outline?.getAttribute("d"));
	});

	it("stays hidden from assistive tech and takes size, color and class like Phosphor icons", () => {
		const { container } = render(SplashIcon, {
			props: { weight: "fill", size: 24, color: "red", class: "size-4" },
		});

		const svg = container.querySelector("svg");
		expect(svg?.getAttribute("aria-hidden")).toBe("true");
		expect(svg?.getAttribute("width")).toBe("24");
		expect(svg?.getAttribute("class")).toBe("size-4");
		expect(paths(container)[0]?.getAttribute("fill")).toBe("red");
	});
});
