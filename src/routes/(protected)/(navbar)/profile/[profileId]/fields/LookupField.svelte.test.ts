// @vitest-environment jsdom

import { render } from "@testing-library/svelte";
import { UsersThreeIcon } from "phosphor-svelte";
import { describe, expect, it } from "vitest";

import { Tribe, tribes } from "$lib/model/users/profiles";
import LookupField from "./LookupField.svelte";

const icon = UsersThreeIcon;

describe("LookupField", () => {
	it("looks up a scalar value", () => {
		const { container } = render(LookupField, {
			props: { icon, value: Tribe.Bear, options: tribes },
		});

		expect(container.textContent).toContain("Bear");
	});

	it("joins a list of values", () => {
		const { container } = render(LookupField, {
			props: { icon, value: [Tribe.Bear, Tribe.Daddy], options: tribes },
		});

		expect(container.textContent).toContain("Bear, Daddy");
	});

	it("renders the label when one is given", () => {
		const { container } = render(LookupField, {
			props: {
				icon,
				label: "Tribes",
				value: Tribe.Bear,
				options: tribes,
			},
		});

		expect(container.textContent).toContain("Tribes");
		expect(container.textContent).toContain("Bear");
	});

	it.each([
		["null", null],
		["undefined", undefined],
		["an empty list", []],
	])("renders nothing for %s", (_, value) => {
		const { container } = render(LookupField, {
			props: { icon, value, options: tribes },
		});

		expect(container.textContent).toBe("");
	});
});
