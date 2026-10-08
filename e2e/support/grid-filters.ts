import type { Page } from "@playwright/test";

const DIALOG = '[role="dialog"]';

export async function openAllFilters(page: Page): Promise<void> {
	await page.locator('[aria-label="All filters"]').click();
	await page.locator(`${DIALOG}:focus-within`).waitFor();
}
