import { expect, type Page, test } from "@playwright/test";

import tauriConfig from "../src-tauri/tauri.conf.json" with { type: "json" };
import { animationsFinished, CLASSIC_SCROLLBARS } from "./support/app";
import { openBrowse } from "./support/profile-pager";

const [mainWindow] = tauriConfig.app.windows;
if (!mainWindow) throw new Error("tauri.conf.json declares no window");
const DEFAULT_WINDOW = { width: mainWindow.width, height: mainWindow.height };
const CLASSIC_SCROLLBAR_PX = 17;
const GRID_SCROLLER = ':has(> [data-slot="grid-content"])';

test.describe.configure({ timeout: 180_000 });

test.use({ viewport: DEFAULT_WINDOW, hasTouch: false, ...CLASSIC_SCROLLBARS });

async function gridColumnsBesideScrollbar({
	page,
	scrollbarPx,
}: {
	page: Page;
	scrollbarPx: number;
}): Promise<number> {
	await page.addStyleTag({
		content: `${GRID_SCROLLER}::-webkit-scrollbar { width: ${scrollbarPx}px; }`,
	});
	await expect
		.poll(() =>
			page.locator(GRID_SCROLLER).evaluate((node) => node.clientWidth),
		)
		.toBe(DEFAULT_WINDOW.width - scrollbarPx);
	return page
		.locator('[data-slot="grid-cells"]')
		.evaluate(
			(grid) =>
				getComputedStyle(grid)
					.gridTemplateColumns.split(" ")
					.filter(Boolean).length,
		);
}

test("the default window opens All filters as three columns that stay under the sheet's height cap", async ({
	page,
}) => {
	await openBrowse(page);
	await page.getByRole("button", { name: "All filters" }).click();
	await page.getByRole("button", { name: "Apply" }).waitFor();
	const sheet = page.locator('[data-slot="sheet-content"]');
	await animationsFinished(sheet, { subtree: true });

	const columnLeaders = sheet.getByRole("checkbox", {
		name: /^(Favorites|Position|Tribes)$/,
	});
	await expect(columnLeaders).toHaveCount(3);
	const leaderLefts = await columnLeaders.evaluateAll((nodes) =>
		nodes.map((node) => node.getBoundingClientRect().left),
	);
	const distinctLeftToRight = [...new Set(leaderLefts)].sort((a, b) => a - b);
	expect(leaderLefts).toEqual(distinctLeftToRight);

	const { height, heightCap } = await sheet.evaluate((node) => ({
		height: node.getBoundingClientRect().height,
		heightCap: parseFloat(getComputedStyle(node).maxHeight),
	}));
	expect(height).toBeLessThan(heightCap);
});

test("the default window shows as many grid columns beside a classic scrollbar as without one", async ({
	page,
}) => {
	await openBrowse(page);

	const withoutScrollbar = await gridColumnsBesideScrollbar({
		page,
		scrollbarPx: 0,
	});
	const besideScrollbar = await gridColumnsBesideScrollbar({
		page,
		scrollbarPx: CLASSIC_SCROLLBAR_PX,
	});

	expect(besideScrollbar).toBe(withoutScrollbar);
});
