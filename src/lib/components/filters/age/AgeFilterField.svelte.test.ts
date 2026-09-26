// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import AgeFilterField from "./AgeFilterField.svelte";

const TRACK_WIDTH = 1000;

const minimumAge = () => screen.getByRole("slider", { name: "Minimum age" });
const maximumAge = () => screen.getByRole("slider", { name: "Maximum age" });

function renderField(value: number[]) {
	const { container } = render(AgeFilterField, {
		props: { checked: false, value },
	});
	const slider = container.querySelector<HTMLElement>(
		'[data-slot="slider"]',
	)!;
	slider.getBoundingClientRect = () =>
		({ left: 0, right: TRACK_WIDTH, top: 0, bottom: 16 }) as DOMRect;
	const track = container.querySelector<HTMLElement>(
		'[data-slot="slider-track"]',
	)!;
	return { track };
}

function pointer({
	target,
	type,
	clientX,
}: {
	target: HTMLElement;
	type: string;
	clientX: number;
}) {
	return fireEvent(
		target,
		new MouseEvent(type, { clientX, bubbles: true, cancelable: true }),
	);
}

afterEach(cleanup);

describe("AgeFilterField", () => {
	it("announces ages, not track positions", () => {
		renderField([25, 60]);

		for (const [thumb, now] of [
			[minimumAge(), "25"],
			[maximumAge(), "60"],
		] as const) {
			expect(thumb.getAttribute("aria-valuenow")).toBe(now);
			expect(thumb.getAttribute("aria-valuemin")).toBe("18");
			expect(thumb.getAttribute("aria-valuemax")).toBe("99");
		}
	});

	it("moves one year per arrow key", async () => {
		renderField([25, 60]);

		await fireEvent.keyDown(minimumAge(), { key: "ArrowRight" });
		expect(minimumAge().getAttribute("aria-valuenow")).toBe("26");
		expect(screen.getByText("26 - 60")).toBeTruthy();

		await fireEvent.keyDown(maximumAge(), { key: "ArrowLeft" });
		expect(maximumAge().getAttribute("aria-valuenow")).toBe("59");
		expect(screen.getByText("26 - 59")).toBeTruthy();
	});

	it("reaches the youngest and oldest ages with Home and End", async () => {
		renderField([25, 60]);

		await fireEvent.keyDown(minimumAge(), { key: "Home" });
		await fireEvent.keyDown(maximumAge(), { key: "End" });

		expect(minimumAge().getAttribute("aria-valuenow")).toBe("18");
		expect(maximumAge().getAttribute("aria-valuenow")).toBe("99");
		expect(screen.getByText("18 years & over")).toBeTruthy();
	});

	it("gives the common ages most of the track when pressed and dragged", async () => {
		const { track } = renderField([18, 99]);

		await pointer({ target: track, type: "pointerdown", clientX: 500 });
		expect(minimumAge().getAttribute("aria-valuenow")).toBe("40");
		expect(screen.getByText("40 years & over")).toBeTruthy();

		await pointer({ target: track, type: "pointermove", clientX: 250 });
		expect(minimumAge().getAttribute("aria-valuenow")).toBe("29");

		await pointer({ target: track, type: "pointermove", clientX: 900 });
		expect(minimumAge().getAttribute("aria-valuenow")).toBe("74");
		await pointer({ target: track, type: "pointerup", clientX: 900 });

		expect(screen.getByText("74 years & over")).toBeTruthy();
	});
});
