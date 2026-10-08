// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import { setLocale, SOURCE_LOCALE } from "$lib/i18n";
import { PSEUDO_MESSAGE } from "$lib/i18n/fixtures/pseudo-message";
import PhotosFilter from "./PhotosFilter.svelte";

const CHOICES = ["Has Photos", "Has Face Pics", "Has Album(s)"];

afterEach(async () => {
	cleanup();
	await setLocale({ locale: SOURCE_LOCALE });
});

describe("PhotosFilter", () => {
	it("words the field and each photo choice in the active locale", async () => {
		render(PhotosFilter, { props: { checked: false, value: [] } });
		const field = screen.getByRole("checkbox", { name: "Photos" });
		const choices = CHOICES.map((name) =>
			screen.getByRole("button", { name }),
		);

		await setLocale({ locale: "en-XA" });

		expect(screen.getByRole("checkbox", { name: PSEUDO_MESSAGE })).toBe(
			field,
		);
		expect(screen.getAllByRole("button", { name: PSEUDO_MESSAGE })).toEqual(
			choices,
		);
	});
});
