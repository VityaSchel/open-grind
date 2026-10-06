// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import ToastUnimplemented from "./ToastUnimplemented.svelte";

afterEach(cleanup);

describe("ToastUnimplemented", () => {
	it("names the missing feature and links its issue", () => {
		const { container, getByRole } = render(ToastUnimplemented, {
			props: {
				message: "chat.composer.voiceMessage.unimplemented",
				issue: 35,
			},
		});

		expect(container.textContent).toBe(
			" TODO: Voice messages not implemented yet, tracking in #35",
		);
		expect(getByRole("link", { name: "#35" }).getAttribute("href")).toBe(
			"https://git.opengrind.org/open-grind/open-grind/issues/35",
		);
	});
});
