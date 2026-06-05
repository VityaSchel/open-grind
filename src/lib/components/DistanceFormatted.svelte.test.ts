// @vitest-environment jsdom

import { render, screen } from "@testing-library/svelte";
import { describe, expect, it } from "vitest";

import DistanceFormatted from "./DistanceFormatted.svelte";

describe("DistanceFormatted", () => {
	it("renders metres below one kilometre", () => {
		render(DistanceFormatted, { props: { distance: 245 } });

		expect(screen.getByText("245 m")).toBeDefined();
	});

	it("renders kilometres from one kilometre upwards", () => {
		render(DistanceFormatted, { props: { distance: 1234 } });

		expect(screen.getByText("1.2 km")).toBeDefined();
	});
});
