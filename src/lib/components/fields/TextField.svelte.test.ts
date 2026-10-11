// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import {
	bracketCounts,
	restoreCountFormatter,
} from "$lib/i18n/fixtures/count-formatter";
import TextField from "./TextField.svelte";

const field = { label: "Display name", value: "Otter", maxLength: 15 };

afterEach(() => {
	cleanup();
	restoreCountFormatter();
});

describe("text field length hint", () => {
	it("counts the characters against the limit", () => {
		render(TextField, { props: field });

		expect(screen.getByText("5/15")).toBeTruthy();
	});

	it("shows both numbers in the regional numbering system", () => {
		const bracketed = bracketCounts();

		render(TextField, { props: field });

		expect(
			screen.getByText(
				`${bracketed(field.value.length)}/${bracketed(field.maxLength)}`,
			),
		).toBeTruthy();
	});
});
