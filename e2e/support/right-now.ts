import { expect, type Page } from "@playwright/test";

import { openGrid } from "./app";

export const RIGHT_NOW_FEED_TIMEOUT = 60_000;

export const rightNowJoinPill = (page: Page) =>
	page.getByRole("button", { name: "Join · 3 free" });

export async function goToRightNow(page: Page): Promise<void> {
	await openGrid(page);
	await page
		.getByRole("navigation", { name: "Main" })
		.getByRole("link", { name: "Right Now" })
		.click();
	await expect(page).toHaveURL(/\/right-now$/);
}
