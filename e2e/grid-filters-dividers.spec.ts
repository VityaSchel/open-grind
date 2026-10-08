import { expect, type Page, test } from "@playwright/test";

import { openGrid } from "./support/app";
import {
	dividers,
	filtersScroller,
	openAllFilters,
	scrollFiltersToBottom,
} from "./support/grid-filters";

const WIDE_VIEWPORT = { width: 1280, height: 800 };

async function openScrolledToBottom(page: Page): Promise<void> {
	await openAllFilters(page);
	await scrollFiltersToBottom(page);
	await expect
		.poll(() => dividers(page))
		.toEqual({ header: true, footer: false });
}

test.beforeEach(() => {
	test.setTimeout(180_000);
});

test("a sheet with nothing to scroll shows no dividers", async ({ page }) => {
	await page.setViewportSize(WIDE_VIEWPORT);
	await openGrid(page);
	await openAllFilters(page);
	const { scrollHeight, clientHeight } = await filtersScroller(page).evaluate(
		({ scrollHeight, clientHeight }) => ({ scrollHeight, clientHeight }),
	);
	expect(scrollHeight).toBeLessThanOrEqual(clientHeight);

	await expect
		.poll(() => dividers(page))
		.toEqual({ header: false, footer: false });
});

test("reopening a sheet scrolled to the bottom shows only the footer divider", async ({
	page,
}) => {
	await openGrid(page);
	await openScrolledToBottom(page);

	await page.keyboard.press("Escape");
	await expect(page.getByRole("dialog")).toHaveCount(0);
	await openAllFilters(page);

	await expect
		.poll(() => dividers(page))
		.toEqual({ header: false, footer: true });
});

test("expanding the last filter at the bottom brings the footer divider back", async ({
	page,
}) => {
	await openGrid(page);
	await openScrolledToBottom(page);

	await page.getByRole("checkbox", { name: "Health Practices" }).click();

	await expect
		.poll(() => dividers(page))
		.toEqual({ header: true, footer: true });
});
