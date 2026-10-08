// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import { setLocale, SOURCE_LOCALE } from "$lib/i18n";
import { PSEUDO_MESSAGE } from "$lib/i18n/fixtures/pseudo-message";
import { FilterPosition } from "$lib/model/browse/grid/filters";
import PositionFilterToggle from "./PositionFilterToggle.svelte";

afterEach(async () => {
	cleanup();
	await setLocale({ locale: SOURCE_LOCALE });
});

describe("PositionFilterToggle", () => {
	it("offers the positions from top to side, then the unspecified one", () => {
		render(PositionFilterToggle, { props: { value: [] } });

		expect(
			screen
				.getAllByRole("button")
				.map((choice) => choice.textContent.trim()),
		).toEqual([
			"Top",
			"Vers Top",
			"Versatile",
			"Vers Bottom",
			"Bottom",
			"Side",
			"Not specified",
		]);
	});

	it("words the unspecified choice in the active locale", async () => {
		render(PositionFilterToggle, { props: { value: [] } });
		const notSpecified = screen.getByRole("button", {
			name: "Not specified",
		});

		await setLocale({ locale: "en-XA" });

		expect(notSpecified.textContent.trim()).toMatch(PSEUDO_MESSAGE);
	});

	it("draws every choice with an icon of its own", () => {
		render(PositionFilterToggle, { props: { value: [] } });

		const drawings = screen
			.getAllByRole("button")
			.map((choice) => choice.querySelector("svg")?.innerHTML);

		expect(drawings).not.toContain(undefined);
		expect(new Set(drawings).size).toBe(drawings.length);
	});

	it("presses the choices whose positions are selected", () => {
		render(PositionFilterToggle, {
			props: {
				value: [FilterPosition.VersTop, FilterPosition.NotSpecified],
			},
		});

		expect(
			screen
				.getAllByRole("button", { pressed: true })
				.map((choice) => choice.textContent.trim()),
		).toEqual(["Vers Top", "Not specified"]);
	});
});
