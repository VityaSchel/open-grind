// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
	FilterPosition,
	type FilterPositionId,
} from "$lib/model/browse/grid/filters";
import PositionQuickFilter from "./PositionQuickFilter.svelte";

function filterSwitch(): HTMLElement {
	return screen.getByRole("switch", { name: "Filter by position" });
}

function button(name: string): HTMLElement {
	return screen.getByRole("button", { name });
}

function pressed(name: string): string | null {
	return button(name).getAttribute("aria-pressed");
}

async function renderOpened({ positions }: { positions: FilterPositionId[] }) {
	const onapply = vi.fn();
	const { rerender } = render(PositionQuickFilter, {
		props: { open: false, positions, onapply },
	});
	await rerender({ open: true });
	return { onapply, rerender };
}

afterEach(cleanup);

describe("PositionQuickFilter", () => {
	it("opens with nothing selected and the filter off when no position is stored", async () => {
		await renderOpened({ positions: [] });

		expect(filterSwitch().getAttribute("aria-checked")).toBe("false");
		expect(pressed("Top")).toBe("false");
		expect(pressed("Side")).toBe("false");
	});

	it("opens with the stored positions selected and the filter on", async () => {
		await renderOpened({
			positions: [FilterPosition.Side, FilterPosition.Bottom],
		});

		expect(filterSwitch().getAttribute("aria-checked")).toBe("true");
		expect(pressed("Side")).toBe("true");
		expect(pressed("Bottom")).toBe("true");
		expect(pressed("Top")).toBe("false");
	});

	it("applies no positions while the filter is off", async () => {
		const { onapply } = await renderOpened({ positions: [] });

		expect(filterSwitch().getAttribute("aria-checked")).toBe("false");

		await fireEvent.click(button("Apply"));

		expect(onapply).toHaveBeenCalledExactlyOnceWith([]);
	});

	it("turns the filter on and applies the positions in ascending order", async () => {
		const { onapply } = await renderOpened({ positions: [] });

		await fireEvent.click(button("Side"));
		await fireEvent.click(button("Not specified"));
		await fireEvent.click(button("Top"));

		expect(filterSwitch().getAttribute("aria-checked")).toBe("true");

		await fireEvent.click(button("Apply"));

		expect(onapply).toHaveBeenCalledExactlyOnceWith([
			FilterPosition.NotSpecified,
			FilterPosition.Top,
			FilterPosition.Side,
		]);
	});

	it("applies no positions once the filter is switched off", async () => {
		const { onapply } = await renderOpened({
			positions: [FilterPosition.Bottom],
		});

		await fireEvent.click(filterSwitch());

		expect(filterSwitch().getAttribute("aria-checked")).toBe("false");

		await fireEvent.click(button("Apply"));

		expect(onapply).toHaveBeenCalledExactlyOnceWith([]);
	});

	it("clears the selection on reset without applying", async () => {
		const { onapply } = await renderOpened({
			positions: [FilterPosition.Bottom],
		});

		await fireEvent.click(button("Reset"));

		expect(pressed("Bottom")).toBe("false");
		expect(onapply).not.toHaveBeenCalled();
	});

	it("keeps an in-progress edit when the stored positions change underneath", async () => {
		const { onapply, rerender } = await renderOpened({ positions: [] });

		await fireEvent.click(button("Side"));
		await rerender({ positions: [FilterPosition.Top] });

		expect(pressed("Side")).toBe("true");
		expect(pressed("Top")).toBe("false");

		await fireEvent.click(button("Apply"));

		expect(onapply).toHaveBeenCalledExactlyOnceWith([FilterPosition.Side]);
	});

	it("picks the stored positions up again the next time it opens", async () => {
		const { rerender } = await renderOpened({ positions: [] });

		await fireEvent.click(button("Side"));
		await rerender({ open: false });
		await rerender({ open: true, positions: [FilterPosition.Top] });

		expect(pressed("Top")).toBe("true");
		expect(pressed("Side")).toBe("false");
		expect(filterSwitch().getAttribute("aria-checked")).toBe("true");
	});
});
