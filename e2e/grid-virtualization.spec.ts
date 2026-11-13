import { expect, type Page, test } from "@playwright/test";

import { installTauriShim, openGrid } from "./support/app";
import {
	GRID_CELL,
	loadGridPages,
	measureGridWindow,
	scrollGridTo,
} from "./support/grid-window";

const PAGES_TO_LOAD = 5;

async function openGridWithProfiles(page: Page) {
	test.setTimeout(180_000);
	await installTauriShim(page, { platform: "macos" });
	await openGrid(page);
	await page.locator(GRID_CELL).first().waitFor({ timeout: 60_000 });
}

test.describe("grid virtualization", () => {
	test("keeps the rendered cells to a window of a much taller grid", async ({
		page,
	}) => {
		await openGridWithProfiles(page);
		await loadGridPages(page, { pages: PAGES_TO_LOAD });
		await scrollGridTo(page, { top: 4000 });

		const view = await measureGridWindow(page);

		expect(view.gridHeight).toBeGreaterThan(10_000);
		expect(view.cells).toBeLessThan(view.columns * 20);
		expect(view.coversTop && view.coversBottom).toBe(true);
	});

	test("lays the window out on the same rows a full grid would use", async ({
		page,
	}) => {
		await openGridWithProfiles(page);
		await loadGridPages(page, { pages: PAGES_TO_LOAD });
		await scrollGridTo(page, { top: 5000 });

		const scrolled = await measureGridWindow(page);

		expect(scrolled.offGrid).toBe(0);
		expect(scrolled.holes).toBe(0);
		expect(scrolled.rowsAbove).toBe(true);
		expect(scrolled.topLeftRadius).toBe("0px");
		expect(scrolled.rowsBelow).toBe(true);
		expect(scrolled.radiusBottom).toBe("0px");

		await scrollGridTo(page, { top: 0 });

		const top = await measureGridWindow(page);

		expect(top.rowsAbove).toBe(false);
		expect(top.topLeftRadius).not.toBe("0px");
		expect(top.radiusBottom).toBe("0px");
	});
});
