// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("#lib/api/browse/location.ts", () => ({
	getPlaces: () =>
		Promise.resolve({
			places: [
				{
					lat: 48.21,
					lon: 16.37,
					name: "Café Central",
					address: "Herrengasse 14, Wien",
					importance: 0.5,
				},
			],
		}),
}));

import { untranslatableTexts } from "#lib/test/untranslatable.ts";
import PlaceSearch from "./PlaceSearch.svelte";

HTMLElement.prototype.scrollIntoView = vi.fn();
afterEach(cleanup);

describe("PlaceSearch", () => {
	it("keeps place names and addresses out of page translation", async () => {
		const { container } = render(PlaceSearch, {
			props: { onpick: () => {} },
		});

		await fireEvent.input(screen.getByRole("combobox"), {
			target: { value: "cafe" },
		});
		await screen.findByRole("option", { name: /Café Central/ });

		expect(untranslatableTexts(container)).toEqual([
			"Café Central",
			"Herrengasse 14, Wien",
		]);
	});
});
