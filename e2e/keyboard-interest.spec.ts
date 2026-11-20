import { expect, type Locator, type Page, test } from "@playwright/test";

import { arrowThrough, focusProblems } from "./support/focus";
import {
	openTaps,
	PAGER,
	TAPS,
	TAPS_PANE,
	VIEWS,
	VIEWS_PANE,
	VIEWS_SCROLLER,
} from "./support/interest-pager";

test.describe.configure({ timeout: 180_000 });

const tablist = (page: Page) => page.getByRole("tablist");
const tab = (page: Page, name: "Views" | "Taps") =>
	page.getByRole("tab", { name, exact: true });

function focusInside(container: Locator): Promise<boolean> {
	return container.evaluate((node) => node.contains(document.activeElement));
}

function historyLength(page: Page): Promise<number> {
	return page.evaluate(() => history.length);
}

test.beforeEach(async ({ page }) => {
	await openTaps(page, { platform: "macos" });
});

test("the Interest tabs are one Tab stop resting on the shown tab", async ({
	page,
}) => {
	const taps = tab(page, "Taps");
	await expect(taps).toHaveAttribute("aria-selected", "true");
	await expect(tablist(page).locator('[tabindex="0"]')).toHaveCount(1);
	await taps.focus();

	await page.keyboard.press("Tab");
	expect(await focusInside(tablist(page))).toBe(false);
	expect(await focusInside(page.locator(TAPS_PANE))).toBe(true);

	await page.keyboard.press("Shift+Tab");
	await expect(taps).toBeFocused();
	await page.keyboard.press("Shift+Tab");
	expect(await focusInside(tablist(page))).toBe(false);
});

test("the arrow keys move between the tabs without switching, and Enter switches in place while focus stays on the tab", async ({
	page,
}) => {
	const views = tab(page, "Views");
	await tab(page, "Taps").focus();
	const depth = await historyLength(page);

	await page.keyboard.press("ArrowLeft");

	await expect(views).toBeFocused();
	await expect(views).toHaveAttribute("aria-selected", "false");
	await expect(page).toHaveURL(new RegExp(`${TAPS}$`));

	await page.keyboard.press("Enter");

	await expect(page).toHaveURL(new RegExp(`${VIEWS}$`));
	await expect(views).toHaveAttribute("aria-selected", "true");
	await expect
		.poll(() => page.locator(PAGER).evaluate((pager) => pager.scrollLeft))
		.toBe(0);
	await expect(views).toBeFocused();
	expect(await historyLength(page)).toBe(depth);

	await page.keyboard.press("ArrowRight");
	await page.keyboard.press(" ");

	await expect(page).toHaveURL(new RegExp(`${TAPS}$`));
	await expect(tab(page, "Taps")).toBeFocused();
});

test("the arrow keys wrap around the tabs with a visible focus ring on each", async ({
	page,
}) => {
	const walk = await arrowThrough(page, {
		start: tab(page, "Taps"),
		key: "ArrowRight",
		stops: 3,
	});

	expect(walk).toHaveLength(2);
	expect(focusProblems(walk)).toEqual([]);
	await expect(tab(page, "Taps")).toBeFocused();
});

test("each tab controls its pane, and the pane off screen is hidden from focus until the pager shows it", async ({
	page,
}) => {
	const views = page.locator(VIEWS_PANE);
	const taps = page.locator(TAPS_PANE);
	for (const [name, pane] of [
		["Views", views],
		["Taps", taps],
	] as const) {
		await expect(pane).toHaveAttribute("role", "tabpanel");
		await expect(tab(page, name)).toHaveAttribute(
			"aria-controls",
			(await pane.getAttribute("id"))!,
		);
	}
	await expect(views).toHaveAttribute("inert", "");
	await expect(views).toHaveAttribute("aria-hidden", "true");
	await expect(taps).not.toHaveAttribute("inert");

	await tab(page, "Views").click();

	await expect(page).toHaveURL(new RegExp(`${VIEWS}$`));
	await expect(taps).toHaveAttribute("inert", "");
	await expect(views).not.toHaveAttribute("inert");
	await expect(views).not.toHaveAttribute("aria-hidden");
});

test("Tab pressed while the pager glides to a picked tab lands in that tab's pane and lets the glide finish", async ({
	page,
}) => {
	const pager = page.locator(PAGER);
	const taps = page.locator(TAPS_PANE);
	await tab(page, "Views").click();
	await expect(page).toHaveURL(new RegExp(`${VIEWS}$`));
	await expect.poll(() => pager.evaluate((node) => node.scrollLeft)).toBe(0);
	await expect(taps).toHaveAttribute("inert", "");

	await tab(page, "Taps").focus();
	await page.keyboard.press("Enter");
	await page.keyboard.press("Tab");

	await expect.poll(() => focusInside(taps)).toBe(true);
	await expect(page).toHaveURL(new RegExp(`${TAPS}$`));
	await expect
		.poll(() =>
			pager.evaluate(
				(node) => Math.abs(node.scrollLeft - node.clientWidth) < 1,
			),
		)
		.toBe(true);
	await expect(page.locator(VIEWS_PANE)).toHaveAttribute("inert", "");
	expect(await focusInside(taps)).toBe(true);
});

test.describe("the Views grid", () => {
	const viewsGrid = (page: Page) =>
		page.locator(VIEWS_PANE).getByRole("grid", { name: "Views" });

	test.beforeEach(async ({ page }) => {
		await tab(page, "Views").click();
		await expect(page).toHaveURL(new RegExp(`${VIEWS}$`));
		await viewsGrid(page)
			.getByRole("gridcell")
			.first()
			.waitFor({ timeout: 60_000 });
	});

	test("is a grid named Views whose rows hold one drawn row of cells each", async ({
		page,
	}) => {
		const rows = await viewsGrid(page).evaluate((grid) => {
			const columns = getComputedStyle(grid)
				.gridTemplateColumns.trim()
				.split(/\s+/).length;
			return [...grid.querySelectorAll(':scope > [role="row"]')].map(
				(row) => {
					const cells = [
						...row.querySelectorAll(':scope > [role="gridcell"]'),
					];
					return {
						columns,
						cells: cells.length,
						tops: new Set(
							cells.map((cell) =>
								Math.round(cell.getBoundingClientRect().top),
							),
						).size,
					};
				},
			);
		});

		expect(rows.length).toBeGreaterThan(1);
		for (const [at, row] of rows.entries()) {
			expect(row.tops).toBe(1);
			if (at < rows.length - 1) expect(row.cells).toBe(row.columns);
		}
	});

	test("Scroll to top from the keyboard puts focus on the first cell", async ({
		page,
	}) => {
		await page
			.locator(VIEWS_SCROLLER)
			.evaluate((node) => node.scrollTo({ top: node.scrollHeight }));
		const jump = page
			.locator(VIEWS_PANE)
			.getByRole("button", { name: "Scroll to top" });
		await jump.focus();
		await page.keyboard.press("Enter");

		await expect
			.poll(() =>
				viewsGrid(page).evaluate(
					(grid) =>
						document.activeElement?.closest('[role="gridcell"]') ===
						grid.querySelector('[role="gridcell"]'),
				),
			)
			.toBe(true);
		await expect(jump).toBeHidden();
	});
});
