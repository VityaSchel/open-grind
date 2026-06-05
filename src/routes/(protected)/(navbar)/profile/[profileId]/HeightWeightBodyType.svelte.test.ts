import { render, screen } from "@testing-library/svelte";
import { describe, expect, it } from "vitest";

import { BodyType } from "$lib/model/profile";
import HeightWeightBodyType from "./HeightWeightBodyType.svelte";

describe("HeightWeightBodyType", () => {
	it("renders height, weight, and body type together", () => {
		render(HeightWeightBodyType, {
			props: {
				height: 180,
				weight: 90_000,
				bodyType: BodyType.Average,
			},
		});

		expect(screen.getByText("180 cm")).toBeDefined();
		expect(screen.getByText("90 kg")).toBeDefined();
		expect(screen.getByText("Average")).toBeDefined();
	});

	it("renders nothing when all values are missing", () => {
		const { container } = render(HeightWeightBodyType, {
			props: {
				height: null,
				weight: null,
				bodyType: null,
			},
		});

		expect(container.innerHTML).toBe("");
	});
});
