// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import ComposerUnimplementedTab from "./ComposerUnimplementedTab.svelte";

afterEach(cleanup);

describe("ComposerUnimplementedTab", () => {
	it("names the missing feature and links its issue", () => {
		const { container, getByRole } = render(ComposerUnimplementedTab, {
			props: {
				message: "chat.composer.attachments.location.unimplemented",
				issue: 35,
			},
		});

		expect(container.textContent).toBe(
			" Unimplemented Sharing your location isn’t implemented yet. Follow the progress in #35.",
		);
		expect(getByRole("link", { name: "#35" }).getAttribute("href")).toBe(
			"https://git.opengrind.org/open-grind/open-grind/issues/35",
		);
	});
});
