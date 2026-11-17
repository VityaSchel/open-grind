// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import PageIndicator from "./PageIndicator.svelte";

afterEach(cleanup);

function indicator(): HTMLElement {
	const element = document.querySelector<HTMLElement>(
		'[data-slot="page-indicator"]',
	);
	if (element === null) throw new Error("No page indicator rendered");
	return element;
}

function bullets(): Element[] {
	return [...indicator().children].filter(
		(child) => child.getAttribute("data-slot") !== "page-indicator-current",
	);
}

describe("the dot shape the profile photos use", () => {
	it("keeps every bullet a dot and slides a stretching dot over them", () => {
		render(PageIndicator, { count: 4, position: 1.5 });

		for (const bullet of bullets()) {
			expect(bullet.classList).toContain("w-2");
			expect(bullet.classList).toContain("h-2");
			expect(bullet.hasAttribute("data-current")).toBe(false);
		}
		const current = indicator().querySelector<HTMLElement>(
			'[data-slot="page-indicator-current"]',
		);
		expect(current?.style.top).toBe("20px");
		expect(current?.style.height).toBe("20px");
		expect(indicator().getAttribute("aria-hidden")).toBe("true");
		expect(indicator().classList).toContain("scrim");
	});
});

describe("the pill shape", () => {
	it("stretches the current bullet into a pill and keeps the group’s size whichever is current", async () => {
		const { rerender } = render(PageIndicator, {
			count: 3,
			position: 0,
			orientation: "horizontal",
			tone: "accent",
			shape: "pill",
			label: "Step 1 of 3",
		});

		const widths = () =>
			bullets().map((bullet) =>
				bullet.classList.contains("w-5") ? 5 : 2,
			);
		expect(widths()).toEqual([5, 2, 2]);
		expect(
			indicator().querySelector('[data-slot="page-indicator-current"]'),
		).toBeNull();

		await rerender({ position: 2 });

		expect(widths()).toEqual([2, 2, 5]);
		expect(bullets()[2]?.classList).toContain("bg-primary");
		expect(bullets()[0]?.classList).toContain("bg-muted-foreground/40");
		expect(indicator().getAttribute("role")).toBe("img");
	});

	it("animates width and color, and not under reduced motion", () => {
		render(PageIndicator, {
			count: 3,
			position: 1,
			orientation: "horizontal",
			shape: "pill",
		});

		for (const bullet of bullets()) {
			expect(bullet.classList).toContain(
				"transition-[width,height,background-color]",
			);
			expect(bullet.classList).toContain("duration-200");
			expect(bullet.classList).toContain("motion-reduce:transition-none");
		}
	});
});
