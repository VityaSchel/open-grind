// @vitest-environment jsdom

import {
	cleanup,
	fireEvent,
	render,
	screen,
	within,
} from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import ToggleGroupTestHarness from "./toggle-group-test-harness.svelte";

const UNITS = {
	label: "Units",
	options: [
		{ value: "metric", text: "Metric" },
		{ value: "imperial", text: "Imperial" },
	],
	chosen: "metric",
};

function optionStates(group: HTMLElement, role: string, state: string) {
	return within(group)
		.getAllByRole(role)
		.map((option) => [
			option.textContent.trim(),
			option.getAttribute(state),
		]);
}

afterEach(cleanup);

describe("ToggleGroup", () => {
	it("offers a single choice as radios in a radio group with the chosen one checked", async () => {
		render(ToggleGroupTestHarness, { type: "single", ...UNITS });
		const group = screen.getByRole("radiogroup", { name: "Units" });

		expect(optionStates(group, "radio", "aria-checked")).toEqual([
			["Metric", "true"],
			["Imperial", "false"],
		]);

		await fireEvent.click(
			within(group).getByRole("radio", { name: "Imperial" }),
		);

		expect(optionStates(group, "radio", "aria-checked")).toEqual([
			["Metric", "false"],
			["Imperial", "true"],
		]);
	});

	it("keeps multiple choices as pressed toggle buttons in a plain group", () => {
		render(ToggleGroupTestHarness, { type: "multiple", ...UNITS });
		const group = screen.getByRole("group", { name: "Units" });

		expect(optionStates(group, "button", "aria-pressed")).toEqual([
			["Metric", "true"],
			["Imperial", "false"],
		]);
		expect(screen.queryByRole("radio")).toBeNull();
	});
});
