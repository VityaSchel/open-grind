// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { createRawSnippet } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

import StickerTile from "./StickerTile.svelte";

const children = createRawSnippet(() => ({
	render: () => '<span data-slot="sticker-content"></span>',
}));

function renderTile({
	selected,
	onclick = () => {},
	translateLabel,
}: {
	selected: boolean;
	onclick?: () => void;
	translateLabel?: boolean;
}) {
	render(StickerTile, {
		props: { label: "Yass", translateLabel, selected, onclick, children },
	});
	return screen.getByRole("button", { name: "Yass" });
}

afterEach(cleanup);

describe("StickerTile", () => {
	it("shows an unpicked sticker as not pressed and without the selection check", () => {
		const tile = renderTile({ selected: false });

		expect(tile.getAttribute("aria-pressed")).toBe("false");
		expect(
			tile.querySelector('[data-slot="sticker-content"]'),
		).not.toBeNull();
		expect(tile.querySelector("svg")).toBeNull();
	});

	it("shows a picked sticker as pressed under the selection check", () => {
		const tile = renderTile({ selected: true });

		expect(tile.getAttribute("aria-pressed")).toBe("true");
		expect(
			tile.querySelector('[data-slot="sticker-content"]'),
		).not.toBeNull();
		expect(tile.querySelector("svg")).not.toBeNull();
	});

	it("keeps a label that names the sticker's own data out of page translation", () => {
		expect(renderTile({ selected: false }).hasAttribute("translate")).toBe(
			false,
		);
		cleanup();

		expect(
			renderTile({ selected: false, translateLabel: false }).getAttribute(
				"translate",
			),
		).toBe("no");
	});

	it("reports a tap", async () => {
		const onclick = vi.fn();
		const tile = renderTile({ selected: false, onclick });

		await fireEvent.click(tile);

		expect(onclick).toHaveBeenCalledOnce();
	});
});
