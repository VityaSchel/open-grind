// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import { setLocale, SOURCE_LOCALE } from "$lib/i18n";
import { PSEUDO_MESSAGE } from "$lib/i18n/fixtures/pseudo-message";
import { untranslatableTexts } from "$lib/test/untranslatable";
import type { FavoriteNote } from "$lib/model/users/favorites";
import FavoriteNoteButton from "./FavoriteNoteButton.svelte";

const SAVED_NOTE = "met at the gym";

function renderButton(note: FavoriteNote) {
	render(FavoriteNoteButton, {
		props: { profileId: 1, note, onSave: () => {} },
	});
	return screen.getByRole("button");
}

afterEach(async () => {
	cleanup();
	await setLocale({ locale: SOURCE_LOCALE });
});

describe("FavoriteNoteButton", () => {
	it("keeps a saved note out of page translation", () => {
		const button = renderButton({ notes: SAVED_NOTE, phoneNumber: "" });

		expect(untranslatableTexts(button)).toEqual([SAVED_NOTE]);
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

	it("words the prompt in the active locale", async () => {
		const button = renderButton({ notes: "", phoneNumber: "" });

		await setLocale({ locale: "en-XA" });

		expect(button.textContent.trim()).toMatch(PSEUDO_MESSAGE);
		expect(untranslatableTexts(button)).toEqual([]);
	});

	it("shows a saved note as written in any locale", async () => {
		const button = renderButton({ notes: SAVED_NOTE, phoneNumber: "" });

		await setLocale({ locale: "en-XA" });

		expect(button.textContent.trim()).toBe(SAVED_NOTE);
		expect(untranslatableTexts(button)).toEqual([SAVED_NOTE]);
	});
});
