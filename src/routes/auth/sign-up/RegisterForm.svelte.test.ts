// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import RegisterForm from "./RegisterForm.svelte";

afterEach(cleanup);

describe("RegisterForm", () => {
	it("explains that registration is not implemented yet", () => {
		const { container, getByRole } = render(RegisterForm);

		expect(container.textContent).toBe(
			" Unimplemented Registration is not implemented yet, track #21. Sign In",
		);
		expect(getByRole("link", { name: "#21" }).getAttribute("href")).toBe(
			"https://git.opengrind.org/open-grind/open-grind/issues/21",
		);
	});
});
