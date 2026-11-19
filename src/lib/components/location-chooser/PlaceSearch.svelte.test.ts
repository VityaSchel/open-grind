// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const location = vi.hoisted(() => ({ getPlaces: vi.fn() }));

vi.mock("#lib/api/browse/location.ts", () => location);

import { untranslatableTexts } from "#lib/test/untranslatable.ts";
import PlaceSearch from "./PlaceSearch.svelte";

HTMLElement.prototype.scrollIntoView = vi.fn();

beforeEach(() => {
	location.getPlaces.mockResolvedValue({
		places: [
			{
				lat: 48.21,
				lon: 16.37,
				name: "Café Central",
				address: "Herrengasse 14, Wien",
				importance: 0.5,
			},
		],
	});
});

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

async function searchFor(query: string): Promise<HTMLElement> {
	render(PlaceSearch, { props: { onpick: () => {} } });
	const search = screen.getByRole("combobox");
	await fireEvent.input(search, { target: { value: query } });
	return search;
}

function controlledElement(search: HTMLElement): HTMLElement | null {
	const id = search.getAttribute("aria-controls");
	return id === null ? null : document.getElementById(id);
}

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

	it("points the search at its results while they are shown", async () => {
		render(PlaceSearch, { props: { onpick: () => {} } });
		const search = screen.getByRole("combobox");
		expect(search.hasAttribute("aria-controls")).toBe(false);

		await fireEvent.input(search, { target: { value: "cafe" } });
		const results = await screen.findByRole("listbox", { name: "Places" });

		expect(search.getAttribute("aria-expanded")).toBe("true");
		expect(results.id).not.toBe("");
		expect(search.getAttribute("aria-controls")).toBe(results.id);
	});

	it("points the search at a panel that is on the page while results load", async () => {
		location.getPlaces.mockReturnValue(new Promise(() => {}));

		const search = await searchFor("cafe");

		expect(search.getAttribute("aria-expanded")).toBe("true");
		await vi.waitFor(() =>
			expect(controlledElement(search)).not.toBeNull(),
		);
		expect(screen.queryByRole("listbox")).toBeNull();
	});

	it("points the search at a panel that is on the page when the search fails", async () => {
		location.getPlaces.mockRejectedValue(new Error("offline"));

		const search = await searchFor("cafe");
		const copyError = await screen.findByRole("button", {
			name: "Copy error details",
		});

		expect(search.getAttribute("aria-expanded")).toBe("true");
		expect(controlledElement(search)?.contains(copyError)).toBe(true);
	});
});
