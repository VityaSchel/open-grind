// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import RightNowPage from "./+page.svelte";

afterEach(cleanup);

describe("Right now page", () => {
	it("explains that the tab is not implemented yet", () => {
		const { container, getByRole } = render(RightNowPage);

		expect(container.textContent).toBe(
			' Unimplemented "Right now" tab is not implemented yet, tracking in #43.',
		);
		expect(getByRole("link", { name: "#43" }).getAttribute("href")).toBe(
			"https://git.opengrind.org/open-grind/open-grind/issues/43",
		);
	});
});
