// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import type { LoadedEntry } from "#lib/credits/index.ts";
import CreditRows from "./CreditRows.svelte";

afterEach(() => {
	cleanup();
	document.getElementById("credits-heading")?.remove();
});

const entry = (overrides: Partial<LoadedEntry>): LoadedEntry => ({
	id: "svelte",
	name: "svelte",
	ecosystem: "npm",
	versions: [],
	spdx: "MIT",
	url: "https://svelte.dev",
	texts: ["MIT License"],
	...overrides,
});

describe("CreditRows", () => {
	it("is a grid named by its heading with one row per link and per license", () => {
		document.body.insertAdjacentHTML(
			"afterbegin",
			'<h2 id="credits-heading">Web Packages</h2>',
		);
		render(CreditRows, {
			props: {
				batches: [
					[
						entry({}),
						entry({
							id: "zlib",
							name: "zlib",
							url: undefined,
							texts: [],
						}),
					],
				],
				revealed: false,
				labelledBy: "credits-heading",
			},
		});

		const grid = screen.getByRole("grid", { name: "Web Packages" });
		const rows = within(grid).getAllByRole("row");
		expect(rows).toHaveLength(4);
		expect(
			rows.map((row) => within(row).getAllByRole("gridcell").length),
		).toEqual([1, 1, 1, 1]);
		expect(
			within(rows[0]!).getByRole("link", { name: "svelte" }),
		).toBeTruthy();
		expect(rows[1]!.querySelector("summary")).not.toBeNull();
		expect(within(rows[2]!).getByText("zlib")).toBeTruthy();
	});
});
