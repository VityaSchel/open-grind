// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("$lib/app-data/preferences.svelte", () => ({
	preferencesSnapshot: () => ({ units: "metric" }),
}));

import DistanceQuickFilter from "./DistanceQuickFilter.svelte";

const METRES_PER_KM = 1000;

function filterSwitch(): HTMLElement {
	return screen.getByRole("switch", { name: "Filter by distance" });
}

function distanceSlider(): HTMLElement {
	return screen.getByRole("slider", { name: "Maximum distance" });
}

function button(name: string): HTMLElement {
	return screen.getByRole("button", { name });
}

async function renderOpened({
	distanceMetres,
}: {
	distanceMetres: number | null;
}) {
	const onapply = vi.fn();
	const { rerender } = render(DistanceQuickFilter, {
		props: { open: false, distanceMetres, onapply },
	});
	await rerender({ open: true });
	return { onapply, rerender };
}

afterEach(cleanup);

describe("DistanceQuickFilter", () => {
	it("opens at the default step with the filter off when no distance is stored", async () => {
		await renderOpened({ distanceMetres: null });

		expect(screen.getByText("Within 10 km")).toBeTruthy();
		expect(distanceSlider().getAttribute("aria-valuetext")).toBe(
			"Within 10 km",
		);
		expect(filterSwitch().getAttribute("aria-checked")).toBe("false");
	});

	it("opens at the stored distance with the filter on", async () => {
		await renderOpened({ distanceMetres: 5 * METRES_PER_KM });

		expect(screen.getByText("Within 5 km")).toBeTruthy();
		expect(distanceSlider().getAttribute("aria-valuenow")).toBe("4");
		expect(filterSwitch().getAttribute("aria-checked")).toBe("true");
	});

	it("applies no distance while the filter is off", async () => {
		const { onapply } = await renderOpened({ distanceMetres: null });

		await fireEvent.click(button("Apply"));

		expect(onapply).toHaveBeenCalledExactlyOnceWith(null);
	});

	it("turns the filter on and applies the distance the slider moved to", async () => {
		const { onapply } = await renderOpened({ distanceMetres: null });

		await fireEvent.keyDown(distanceSlider(), { key: "ArrowRight" });

		expect(screen.getByText("Within 20 km")).toBeTruthy();
		expect(filterSwitch().getAttribute("aria-checked")).toBe("true");

		await fireEvent.click(button("Apply"));

		expect(onapply).toHaveBeenCalledExactlyOnceWith(20 * METRES_PER_KM);
	});

	it("applies no distance once the filter is switched off", async () => {
		const { onapply } = await renderOpened({
			distanceMetres: 5 * METRES_PER_KM,
		});

		await fireEvent.click(filterSwitch());

		expect(filterSwitch().getAttribute("aria-checked")).toBe("false");

		await fireEvent.click(button("Apply"));

		expect(onapply).toHaveBeenCalledExactlyOnceWith(null);
	});

	it("returns the slider to the default step on reset without applying", async () => {
		const { onapply } = await renderOpened({
			distanceMetres: 2 * METRES_PER_KM,
		});

		await fireEvent.click(button("Reset"));

		expect(screen.getByText("Within 10 km")).toBeTruthy();
		expect(onapply).not.toHaveBeenCalled();

		await fireEvent.click(button("Apply"));

		expect(onapply).toHaveBeenCalledExactlyOnceWith(10 * METRES_PER_KM);
	});

	it("keeps an in-progress edit when the stored distance changes underneath", async () => {
		const { onapply, rerender } = await renderOpened({
			distanceMetres: null,
		});

		await fireEvent.keyDown(distanceSlider(), { key: "ArrowRight" });
		await rerender({ distanceMetres: 30 * METRES_PER_KM });

		expect(screen.getByText("Within 20 km")).toBeTruthy();
		expect(screen.queryByText("Within 30 km")).toBeNull();

		await fireEvent.click(button("Apply"));

		expect(onapply).toHaveBeenCalledExactlyOnceWith(20 * METRES_PER_KM);
	});

	it("picks the stored distance up again the next time it opens", async () => {
		const { rerender } = await renderOpened({ distanceMetres: null });

		await fireEvent.keyDown(distanceSlider(), { key: "ArrowRight" });
		await rerender({ open: false });
		await rerender({ open: true, distanceMetres: 30 * METRES_PER_KM });

		expect(screen.getByText("Within 30 km")).toBeTruthy();
		expect(filterSwitch().getAttribute("aria-checked")).toBe("true");
	});
});
