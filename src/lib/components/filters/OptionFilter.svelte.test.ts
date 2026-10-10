// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { featureFlagsState } from "$lib/api/feature-flags-state.svelte";
import { type OptionFilterDefinition, optionFilters } from "./option-filters";
import OptionFilter from "./OptionFilter.svelte";

function offersTrans(filter: OptionFilterDefinition): boolean {
	render(OptionFilter, { props: { filter, checked: true, value: [] } });
	return screen.queryByRole("button", { name: "Trans" }) !== null;
}

describe("OptionFilter while the gender filter flag is on", () => {
	beforeEach(() => {
		featureFlagsState.keys = ["gender-filter"];
	});

	afterEach(() => {
		cleanup();
		featureFlagsState.keys = [];
	});

	it("leaves Trans out of Their Tribes", () => {
		expect(offersTrans(optionFilters.tribes)).toBe(false);
	});

	it("still offers Trans among the tribes they're into", () => {
		expect(offersTrans(optionFilters.tribesImInto)).toBe(true);
	});
});
