// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("embla-carousel-svelte", () => ({ default: () => {} }));

import {
	bracketCounts,
	restoreCountFormatter,
} from "$lib/i18n/fixtures/count-formatter";
import WheelPicker from "./wheel-picker.svelte";

const range = { value: 30, min: 18, max: 99, unit: "years" };

const valueText = () =>
	screen.getByRole("slider").getAttribute("aria-valuetext");

afterEach(() => {
	cleanup();
	restoreCountFormatter();
});

describe("wheel picker value text", () => {
	it("speaks the value with its unit", () => {
		render(WheelPicker, { props: range });

		expect(valueText()).toBe("30 years");
	});

	it("speaks the value as valueText words it, over the unit", () => {
		render(WheelPicker, {
			props: {
				...range,
				valueText: (value: number) => `${value} winters`,
			},
		});

		expect(valueText()).toBe("30 winters");
	});
});

describe("wheel picker numbers", () => {
	it("shows and speaks each value in the regional numbering system", () => {
		const bracketed = bracketCounts();

		render(WheelPicker, { props: range });

		expect(screen.getByText(bracketed(range.min))).toBeTruthy();
		expect(screen.getByText(bracketed(range.max))).toBeTruthy();
		expect(valueText()).toBe(`${bracketed(range.value)} ${range.unit}`);
	});
});
