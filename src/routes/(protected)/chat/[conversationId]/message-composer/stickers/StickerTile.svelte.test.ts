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
}: {
	selected: boolean;
	onclick?: () => void;
}) {
	render(StickerTile, {
		props: { label: "Yass", selected, onclick, children },
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

	it("reports a tap", async () => {
		const onclick = vi.fn();
		const tile = renderTile({ selected: false, onclick });

		await fireEvent.click(tile);

		expect(onclick).toHaveBeenCalledOnce();
	});
});
