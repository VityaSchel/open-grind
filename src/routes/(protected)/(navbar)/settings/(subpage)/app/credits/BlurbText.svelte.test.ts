// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import BlurbText from "./BlurbText.svelte";

afterEach(cleanup);

const markup = (container: HTMLElement) =>
	container.innerHTML.replaceAll("<!---->", "");

describe("BlurbText", () => {
	it("links the project name inside its thank-you sentence", () => {
		const { container } = render(BlurbText, {
			props: {
				name: "Svelte",
				blurb: "settings.credits.highlights.svelte",
				url: "https://svelte.dev",
			},
		});

		expect(markup(container)).toBe(
			'<p class="text-sm wrap-anywhere text-muted-foreground">Thanks to <a href="https://svelte.dev" class="font-semibold hover:underline">Svelte</a> for the awesome UI building framework!</p>',
		);
	});

	it("shows the bold name alone without a blurb or link", () => {
		const { container } = render(BlurbText, { props: { name: "zlib" } });

		expect(markup(container)).toBe(
			'<p class="text-sm wrap-anywhere text-muted-foreground"><span class="font-semibold">zlib</span></p>',
		);
	});
});
