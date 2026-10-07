// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import { untranslatableTexts } from "$lib/test/untranslatable";
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
		untranslatable: untranslatableTexts(heading),
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

	it("keeps the name out of page translation, not the age or fallback", () => {
		expect(
			renderHeading({ displayName: "Peer", age: 27 }).untranslatable,
		).toEqual(["Peer"]);
		cleanup();
		expect(
			renderHeading({ displayName: null, age: 27 }).untranslatable,
		).toEqual([]);
	});

	it("calls a nameless profile Someone", () => {
		expect(renderHeading({ displayName: null, age: 30 }).text).toBe(
			"Someone, 30",
		);
	});
});
