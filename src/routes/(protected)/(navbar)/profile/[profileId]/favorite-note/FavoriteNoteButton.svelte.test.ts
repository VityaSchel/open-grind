// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import { untranslatableTexts } from "$lib/test/untranslatable";
import type { FavoriteNote } from "$lib/model/users/favorites";
import FavoriteNoteButton from "./FavoriteNoteButton.svelte";

function renderButton(note: FavoriteNote) {
	render(FavoriteNoteButton, {
		props: { profileId: 1, note, onSave: () => {} },
	});
	return screen.getByRole("button");
}

afterEach(cleanup);

describe("FavoriteNoteButton", () => {
	it("keeps a saved note out of page translation", () => {
		const button = renderButton({
			notes: "met at the gym",
			phoneNumber: "",
		});

		expect(untranslatableTexts(button)).toEqual(["met at the gym"]);
	});

	it("keeps a saved phone number out of page translation", () => {
		const button = renderButton({ notes: "", phoneNumber: "+43 660 1234" });

		expect(untranslatableTexts(button)).toEqual(["+43 660 1234"]);
	});

	it("lets page translation reach the prompt shown without a note", () => {
		const button = renderButton({ notes: "", phoneNumber: "" });

		expect(button.textContent).toContain("Add note");
		expect(untranslatableTexts(button)).toEqual([]);
	});
});
