// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import { rendered } from "#lib/grid/grid-test-helpers.ts";
import ProfilePreview from "./ProfilePreview.svelte";

afterEach(cleanup);

describe("ProfilePreview", () => {
	it("marks a visitor from the grid with an airplane before the profile loads", () => {
		render(ProfilePreview, {
			row: { ...rendered({ id: 100001 }), isVisiting: true },
			ourProfile: false,
		});

		expect(screen.getByTitle("Visiting")).toBeTruthy();
	});
});
