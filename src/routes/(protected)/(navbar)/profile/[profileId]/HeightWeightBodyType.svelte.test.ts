// @vitest-environment jsdom

import { render } from "@testing-library/svelte";
import { describe, expect, it } from "vitest";

import { BodyType } from "$lib/model/users/profiles";
import HeightWeightBodyType from "./HeightWeightBodyType.svelte";

describe("HeightWeightBodyType", () => {
	it("renders height, weight, and body type together", () => {
		const { container } = render(HeightWeightBodyType, {
			props: {
				height: 180,
				weight: 90_000,
				bodyType: BodyType.Average,
			},
		});

		expect(container.textContent).toContain("180 cm");
		expect(container.textContent).toContain("90 kg");
		expect(container.textContent).toContain("Average");
	});

	it("renders nothing when all values are missing", () => {
		const { container } = render(HeightWeightBodyType, {
			props: {
				height: null,
				weight: null,
				bodyType: null,
			},
		});

		expect(container.textContent).toBe("");
	});
});
