// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import {
	bracketCounts,
	restoreCountFormatter,
} from "$lib/i18n/fixtures/count-formatter";
import MultilineField from "./MultilineField.svelte";

const field = { label: "About me", value: "Otter", maxLength: 15 };

afterEach(() => {
	cleanup();
	restoreCountFormatter();
});

describe("multiline field remaining count", () => {
	it("counts the characters left before the limit", () => {
		render(MultilineField, { props: field });

		expect(screen.getByText("10")).toBeTruthy();
	});

	it("shows the count in the regional numbering system", () => {
		const bracketed = bracketCounts();

		render(MultilineField, { props: field });

		expect(
			screen.getByText(bracketed(field.maxLength - field.value.length)),
		).toBeTruthy();
	});
});
