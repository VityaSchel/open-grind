// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import { untranslatableTexts } from "$lib/test/untranslatable";
import Socials from "./Socials.svelte";

afterEach(cleanup);

describe("Socials", () => {
	it("keeps every handle out of page translation", () => {
		const { container } = render(Socials, {
			props: {
				socials: {
					instagram: { userId: "sam.climbs" },
					twitter: { userId: "sam_x" },
					facebook: { userId: "100012345" },
				},
			},
		});

		expect(screen.getAllByRole("link")).toHaveLength(3);
		expect(untranslatableTexts(container)).toEqual([
			"sam.climbs",
			"sam_x",
			"100012345",
		]);
	});
});
