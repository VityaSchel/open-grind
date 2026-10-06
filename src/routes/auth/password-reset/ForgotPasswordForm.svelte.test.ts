// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import ForgotPasswordForm from "./ForgotPasswordForm.svelte";

afterEach(cleanup);

describe("ForgotPasswordForm", () => {
	it("explains that password reset is not implemented yet", () => {
		const { container, getByRole } = render(ForgotPasswordForm);

		expect(container.textContent).toBe(
			" Unimplemented Password reset is not implemented yet, track #22. Sign In",
		);
		expect(getByRole("link", { name: "#22" }).getAttribute("href")).toBe(
			"https://git.opengrind.org/open-grind/open-grind/issues/22",
		);
	});
});
