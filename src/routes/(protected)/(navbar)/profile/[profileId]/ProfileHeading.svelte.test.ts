// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import ProfileHeading from "./ProfileHeading.svelte";

function renderHeading(props: {
	displayName: string | null;
	age: number | null | undefined;
}) {
	render(ProfileHeading, { props });
	const heading = screen.getByRole("heading", { level: 1 });
	return {
		text: heading.textContent
			.replace(/\s+/g, " ")
			.replace(" ,", ",")
			.trim(),
		placeholder: heading.querySelector('[data-slot="skeleton"]'),
	};
}

describe("ProfileHeading", () => {
	afterEach(cleanup);

	it("follows the name with a known age", () => {
		const { text, placeholder } = renderHeading({
			displayName: "Peer",
			age: 27,
		});

		expect(text).toBe("Peer, 27");
		expect(placeholder).toBeNull();
	});

	it("prints the name alone when the profile shows no age", () => {
		const { text, placeholder } = renderHeading({
			displayName: "Peer",
			age: null,
		});

		expect(text).toBe("Peer");
		expect(placeholder).toBeNull();
	});

	it("holds the place of an age the grid row cannot know", () => {
		const { text, placeholder } = renderHeading({
			displayName: "Peer",
			age: undefined,
		});

		expect(text).toBe("Peer,");
		expect(placeholder).not.toBeNull();
	});

	it("calls a nameless profile Someone", () => {
		expect(renderHeading({ displayName: null, age: 30 }).text).toBe(
			"Someone, 30",
		);
	});
});
