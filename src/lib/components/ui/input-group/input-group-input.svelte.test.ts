// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import InputGroupInput from "./input-group-input.svelte";

afterEach(cleanup);

describe("InputGroup.Input", () => {
	it("leaves the touch focus ring to the group instead of drawing its own", () => {
		render(InputGroupInput, { props: { "aria-label": "Search" } });

		const classes = screen.getByRole("textbox").classList;

		expect(classes).not.toContain("not-can-hover:focus-visible:ring-3");
		expect(classes).toContain("not-can-hover:focus-visible:ring-0");
	});
});
